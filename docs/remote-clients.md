# Подключение mobile и desktop к серверу GeckIt

Статус: архитектура одобрена Алексом; первый этап реализован локально. Проверки и границы: [implementation evidence](reports/remote-clients.md). Исходное исследование ниже сохраняет варианты развития; они не все реализованы. 2026-11-06. Учтены уточнения Алекса: предпочтителен P2P; код выдаётся CLI **на том сервере**, к которому подключается клиент. Короткая запись решения: [ITD-001](../DECISIONS.md).

## Рекомендация

Сделать общий протокол подключения mobile/desktop к GeckIt service: сервер выдаёт одноразовое приглашение, клиент вводит код или сканирует его QR, стороны сохраняют отдельное доверие к устройству. Данные передаются по WebRTC DataChannel напрямую, когда ICE находит путь, иначе через TURN. NAT traversal, DTLS и SCTP выполняет готовая библиотека. P2P нужен сразу как основной transport; писать собственный traversal не нужно.

Минимальный первый этап: headless-сервер без Electron, выдача кода CLI, сопряжение обоих типов клиента, выбор сервера, реальный snapshot его проектов/сессий/Manager, чтение истории и живые события, переподключение и отзыв устройства. Доступ по умолчанию только для наблюдения. Отправка заданий и ответы на approvals - следующий отдельный этап. Это подключение к работающему GeckIt на сервере, а не запуск Claude на SSH-хосте из локального GeckIt.

## Границы исследования и надёжность выводов

- Код проверен в текущем checkout `/Users/alex/Projects/mine/geckit`, базовый HEAD `a2318afdba8d6cc74f8a5c2d7ba0940ce8af6113`, ветка `main`. Наличие кода не доказывает наличие функции в опубликованном приложении.
- Во время исследования другая сессия добавила незакоммиченные изменения истории статусов. Проверены затронутые участки transport/bootstrap/store: границы этого решения не изменились. Чужие изменения не редактировались и не включены в эту работу.
- Ниже «существует» означает прочитанный код или явно обозначенное поведение working tree. «Предлагается» означает новую архитектуру, команды и параметры, которых сейчас нет.
- Прочитаны проектные инструкции, `docs/features.md`, headless/SSH/phone документы и соответствующий код. В каталоге llmdex нет индекса GeckIt, поэтому использовано прямое чтение исходников; ничего не индексировалось. Применены `technical-decision` и `research-brief`; подходящих записей в personal library нет.
- Внешние технические сведения проверены по первичным источникам 2026-11-06. README ветки разработки библиотеки не равен проверенному релизному артефакту. Совместимость выбранных бинарников ещё надо доказать.
- Не читались файлы credentials, `.env`, vault, ключи или настройки доступа. Работающие сервисы, приложение и инфраструктура не изменялись и не перезапускались. Сетевые и native acceptance-тесты не проводились: это исследование, а не реализованная функция.

## Что уже есть в GeckIt

| Область | Факт по коду | Следствие для решения |
| --- | --- | --- |
| Headless | [service/index.ts](../client/src/service/index.ts), [runtime.ts](../client/src/core/runtime.ts), [headless-service.md](headless-service.md): отдельный Node 22+ service владеет runtime, сессиями, Manager, каналами, расписаниями и SSH. Desktop не требуется для core. Документ помечает это working tree, не release artifact. | На удалённой машине запускается этот service под её OS-пользователем. Не надо создавать второй backend. |
| Desktop transport | [service-client.ts](../client/src/main/service-client.ts), [rpc.ts](../client/src/core/rpc.ts): Unix socket/named pipe, startup token, V8 serialization, protocol 1; desktop требует совпадения package version, получает bootstrap, буферизует события и переподключается. | Сетевого desktop attachment нет. Нельзя просто вынести этот privileged IPC в Интернет. |
| Bootstrap/events | [application.ts:113](../client/src/core/application.ts#L113), [events.ts](../client/src/core/events.ts), [runtime.ts:341](../client/src/core/runtime.ts#L341): `service:bootstrap` обновляет список и возвращает current state, Manager, home/platform/name; события sessions/items/lineup/employees/hosts/Manager/settings. | Использовать семантику core, но сделать отдельные разрешённые DTO и snapshot barrier: нет remote cursors, epoch и гарантированного replay. |
| Локальный CLI | [cli/service.ts](../client/src/cli/service.ts), [shared/service.ts](../client/src/shared/service.ts): status, projects, sessions, Manager, employees, generic `service call`, shutdown; trusted local operator token. [cli/index.ts](../client/src/cli/index.ts) также читает локальные provider transcripts и SSH mirrors. | CLI уже управляет конкретным локальным service. Выдача invitation должна быть его новой операторской командой, не командой ассистента. Обычный CLI не станет remote-клиентом автоматически. |
| Manager | [cli/manage.ts](../client/src/cli/manage.ts), [core/operator.ts](../client/src/core/operator.ts), [runtime.ts](../client/src/core/runtime.ts): Manager работает внутри service, его CLI аутентифицируется отдельными session/token/operation. | Device trust не даёт Manager/operator credentials. Manager сервера остаётся на сервере; его команды не перенаправляются в локальный Manager клиента. |
| Проекты/метаданные | [configuration.ts](../client/src/core/configuration.ts), [store.ts:243](../client/src/main/store.ts#L243): projects и настройки в service configuration, заметки и статусы разговоров в `sessions.json`, keyed by session id. | Нельзя объединить файлы данных разных серверов или использовать голый session id в общем клиентском cache. |
| История | [core/sessions.ts](../client/src/core/sessions.ts), [sessions/disk.ts](../client/src/main/sessions/disk.ts), [sessions/codex.ts](../client/src/main/sessions/codex.ts): чтение provider-owned transcripts; GeckIt добавляет своё состояние через notes/runtime. | Источник истины составной, но читается и интерпретируется service на владельце данных. Клиенту передаются представления, а не синхронизируется provider home. |
| SSH hosts | [shared/hosts.ts](../client/src/shared/hosts.ts), [hosts/route.ts](../client/src/main/hosts/route.ts), [hosts/ssh.ts](../client/src/main/hosts/ssh.ts), [hosts/disk.ts](../client/src/main/hosts/disk.ts), [hosts/run.ts](../client/src/main/hosts/run.ts): roots `ssh://<host id><path>`, SSH config/agent, remote Claude runs, offsets и локальные mirrors. Builtin remote execution - Claude; builtin Codex локальный. | SSH host - execution target внутри одного service, не удалённый GeckIt service со своим Manager/очередью/настройками. Codex, локальный для удалённого service, не становится SSH Codex. |
| Phone P2P | [link.ts](../client/src/renderer/src/link.ts), [peer/main.ts](../client/src/renderer/src/peer/main.ts), [main/index.ts:715](../client/src/main/index.ts#L715): hidden Electron renderer держит WebRTC, IPC разрешает только `PHONE_CALLS`. [phone.ts](../client/src/renderer/src/phone.ts) строит `window.geckit` поверх link. | Есть полезные framing, compression, pagination и подписки, но server WebRTC сейчас живёт в desktop. Нельзя обещать phone attachment к headless без нового transport adapter. |
| Текущее pairing | [pairing.ts](../client/src/shared/pairing.ts): QR/deep-link `geckit://pair?k=...&s=...` несёт общий pairing key; room - hash key, SDP запечатан AES-GCM. `Signed` содержит SDP/time, это не цифровая подпись устройства. | Хорошая основа для sealed signaling, но общий долгоживущий ключ не заменяет одноразовый invitation и отдельную device identity. |
| Signaling/TURN | [firestore.rules](../signal/firestore.rules), [functions/index.js](../signal/functions/index.js): Firestore rooms/offers/answers, freshness и TTL поля; ICE endpoint выдаёт Cloudflare TURN только при наличии настроенных server-side переменных, иначе STUN. Доступ к правилам основан на форме данных/непредсказуемом room, нет device ACL. | Можно развить существующий signal project, но нужны invitation lifecycle, аутентификация, лимиты и новые правила. По исходникам нельзя утверждать, что production TURN включён. |
| Native | [service/application.ts](../client/src/service/application.ts), [main/index.ts](../client/src/main/index.ts): desktop завершает native trash и исполняет terminal/capture; phone screen зависит от permissions компьютера. | Удалённый service не вправе послать `core:trash` или `core:terminal` клиенту и заставить его воздействовать на локальную машину. |

Полный список возможностей остаётся [в features.md](features.md). Новая remote-client функция туда не добавляется: она пока предложена. В списке headless осталась формулировка о неготовом Slack, тогда как текущий runtime/проектные инструкции уже включают channels; эта историческая строка не используется как доказательство текущих transport-границ.

## Выбор transport и библиотек

| Вариант | Плюсы | Цена/ограничения | Вывод |
| --- | --- | --- | --- |
| **WebRTC: direct preferred + TURN fallback** | Один wire transport с существующим mobile. ICE/STUN/TURN и шифрование реализует готовый стек. | Нужны rendezvous, STUN, опциональный TURN; native server dependency и тестирование сетей. | Основной вариант с первого этапа. |
| Свой traversal | Полный контроль. | Самостоятельные NAT-техники, повторы, сетевые изменения и эксплуатация; это не задача отображения данных. | Отвергнуть. Готовые библиотеки всё равно потребуются для безопасного transport. |
| Relay-first | Удобный контроль маршрута; outbound connection с обеих сторон. | Весь поток зависит от relay и оплачивает его трафик; WebSocket relay сам по себе не даёт E2E. | Не default. Опциональный relay-only режим пригодится для приватности IP/диагностики. |
| Direct TLS/mTLS, SSH tunnel или VPN | Предсказуемый операторский путь к доступному серверу; OpenSSH умеет forwarding TCP и Unix sockets. | Не решает приложение pairing по коду; адреса/доступность/сертификаты или VPN на устройствах. | Дополнительный путь для администраторов, не подмена P2P. [OpenSSH](https://man.openbsd.org/ssh) |

VPN тоже может использовать прямые соединения и relay: [Tailscale](https://tailscale.com/docs/reference/connection-types) описывает direct/DERP/peer relay с WireGuard E2E. Это другой слой продукта, не аргумент, что серверы при P2P не нужны.

Кандидаты для готового P2P стека:

1. **Рекомендуется `node-datachannel` поверх `libdatachannel` на сервере**, browser `RTCPeerConnection` на mobile/desktop. [README](https://github.com/murat-dogan/node-datachannel) заявляет Node/Electron, N-API 8 и prebuilt-пакеты для основных OS/arch. [API](https://github.com/murat-dogan/node-datachannel/blob/master/API.md) содержит DataChannel, TURN UDP/TCP/TLS, fingerprints, bufferedAmount, candidate pair. [libdatachannel](https://github.com/paullouisageneau/libdatachannel) реализует ICE/STUN/TURN и browser interoperability; лицензия MPL-2.0. Это поддерживаемый публичный проект, а не SLA. Библиотека решает transport, **не** invitation, device ACL, snapshot или Manager routing. Не выдавать её установку за готовое remote API.
2. **`js-libp2p`**: готовые PeerId, Noise, multiplexing, WebRTC и Circuit Relay. [Текущая API-документация](https://libp2p.github.io/js-libp2p/modules/_libp2p_webrtc.html) показывает WebRTC и WebRTC Direct, relay для SDP и Noise-проверку PeerId. [package source](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-webrtc/package.json) сам зависит от `node-datachannel`: native packaging не исчезает. Хорошая альтернатива при необходимости нескольких transport и сети peers, но больше протоколов/relay-инфраструктуры и переработки phone link для одной пары клиент-сервер. Старый guide говорит, что WebRTC Direct ещё нет; этот вывод устарел относительно module API. Проверять конкретный release.
3. **Hyperswarm/HyperDHT**: [HyperDHT](https://github.com/holepunchto/hyperdht) предоставляет discovery по ключу, UDP hole punching, Noise streams и bootstrap nodes. Для Node это привлекательный компактный вариант; для существующего browser/Capacitor клиента понадобится иной adapter/bridge и новая discovery-система. [Предлагаемый DHT relay package](https://github.com/holepunchto/hyperswarm-dht-relay) прямо помечен experimental, непригодным для production; это не утверждение о всех relay-вариантах экосистемы. Пока не выбирать без отдельного доказательства mobile и fallback пути.

Не строить выбор на звёздах GitHub или обещанном проценте прохождения NAT: такого измерения для GeckIt нет. На этом этапе выбран архитектурный путь; окончательная версия зависимости фиксируется после короткого packaging/interoperability spike в отдельной реализации.

## Упаковка и граница процессов (предложение)

```text
mobile WebView / desktop renderer
  common RemoteHostClient: protocol, identity, snapshot, subscriptions
       | WebRTC reliable ordered DataChannel, authenticated endpoints
       | direct ICE route OR TURN carrying encrypted packets
remote Node service: RemoteAccess gateway -> core methods/events -> host data/providers
       | outbound HTTPS signaling + STUN/TURN
       + local operator CLI -> private IPC -> invitation/device administration
```

Remote gateway входит в **тот же** service process/lifecycle; не запускает второй runtime. CLI выдаёт invitation через локальный authenticated operator IPC и может завершиться, пока service ждёт клиента. Не нужен Electron/Xvfb на сервере. Desktop может использовать Chromium WebRTC, как уже делает телефонный bridge; долгоживущая сессия не должна принадлежать закрываемому chat-компоненту.

Сейчас [service.vite.config.ts](../client/service.vite.config.ts) требует самодостаточный JS bundle и отвергает внешние runtime imports. `.node` addon нельзя просто встроить в JS. Предлагается явно упаковывать binding и platform prebuild рядом с service, расширить проверку bundle, зафиксировать release/checksums/licenses и fallback сборки. Для desktop renderer native addon не нужен; если размещать его в Electron process - отдельно проверить loader/ASAR unpack, подпись и notarization. Серверный bundle обязан работать без compiler, `node_modules` из checkout и display server на целевых платформах. Текущая гарантия «одна JS-папка без dependencies» потребует уточнения документации. Ничего из этого здесь не менялось.

## Серверный код подключения и общий pairing v2 (предложение)

Выдача кода - создание временного invitation на определённом service, а не раскрытие `phoneKey`, `operator-token`, приватного server key, SSH/VPN credentials. Пользователь уже имеет локальный операторский доступ на сервере. Клиенту не нужен адрес сервера, SSH account или открытый входящий порт приложения.

1. Service имеет стабильную server identity: случайный `serverId`, signing public/private key; private key защищён host vault. Mobile и каждый desktop создают свои ключи в защищённом хранилище устройства. Имя сервера/клиента - подпись для человека, идентичность определяется ключом.
2. Оператор создаёт invitation для выбранных project scopes и `observe` с TTL **5 минут**. Код первого этапа - случайные **128 бит**, около 26 символов Base32, сгруппированных для ввода, с version/checksum отдельно. Это сознательно длиннее шестизначного PIN. У CLI есть явная область данных `--data`; код нельзя случайно получить от другого service instance.
3. Service публикует в rendezvous короткоживущий зашифрованный descriptor: invitation ID, serverId/public key, expiry, scopes и protocol. Непредсказуемый room locator выводится из кода с отдельным domain label; ключ запечатывания - отдельным derivation label. Сам код и расшифровка descriptor не передаются rendezvous. Использовать стандартные HKDF/AEAD через проверенные crypto API, не собственный шифр. На сервере invitation secret живёт только в памяти до expiry; после restart invitation недействителен.
4. Пользователь вводит код в mobile/desktop. Оба используют один pairing v2, отличаются только UI и key storage. Клиент получает descriptor, проверяет срок, отправляет sealed запрос с **client public key**, nonce и подписью доказательства владения. Service отвечает доказательством server key. Протокол связывает обе identity, invitation ID, protocol, scopes, expiry и nonces. Отдельные DTLS fingerprints и SDP входят в аутентифицированный transcript; signaling не может заменить endpoint.
5. CLI показывает запрашиваемое устройство и короткую проверочную фразу/отпечаток transcript; клиент показывает то же. По умолчанию оператор сверяет и подтверждает на сервере. Это добавляет один шаг после ввода кода, но предотвращает молчаливое принятие чужого устройства при утечке invitation. До подтверждения нет snapshot или core RPC. CLI можно закрыть и затем подтвердить pending request операторской командой.
6. Только после доказательства ключей и подтверждения сервер **атомарно** записывает grant для этого client key и делает invitation consumed. Одновременно успешным может быть одно устройство. Повтор завершения тем же enrollment ID возвращает тот же результат без второго grant; потерянный ответ не превращает invitation в многоразовый. Другому ключу отказ. Неполный/неподтверждённый запрос не должен навсегда отнимать invitation; pending TTL/ограничения защищают от reservation DoS. Клиент сохраняет pinned server key только после завершения.
7. Удаляются invitation secret/descriptor и pending exchanges; сервер всё равно сам проверяет expiry/consumed, не полагается на скорость Firestore TTL. Новое устройство получает **новый** invitation. QR и `geckit://connect?...` - представления того же временного приглашения, не отдельный режим доверия. Не открывать web URL с secret в query; deep-link не должен попадать в telemetry/history/logs. Для custom rendezvous QR может включать проверяемый HTTPS endpoint; вручную вводимый код первого этапа использует встроенный доверенный discovery endpoint.

Pairing control messages и сверка устройства проходят через sealed signaling, до готовности DataChannel. Поэтому сопряжение не зависит от возможности прямого P2P: после проверки invitation proof сервер может разрешить короткий ограниченный TURN lease для завершения соединения. Это ещё не доступ к данным. Конкретные форматы подписываемого transcript, derivation labels, key confirmation и state machine должны пройти security review перед реализацией; эта записка не заменяет проверку криптографического протокола.

Защита: только HTTPS/WSS для rendezvous, AEAD sealed payload, crypto-random invitation, server-authoritative TTL и single-use, подписи и nonces, rate limits на IP/room/device и глобальные квоты, предел попыток и размеров, одинаковые ответы для неизвестного/истёкшего invitation. Rate limiting нужен на signaling **и** service. Не логировать код/SDP/private keys. Сервер подтверждает устройство, клиент сверяет серверную фразу. Перехваченный действующий код всё ещё является временным bearer invitation: нельзя обещать защиту при компрометации терминала или канала передачи. При подозрении - cancel и новый invitation.

Не сокращать код до 6-8 цифр, просто хешируя его: публичный room/AEAD ciphertext позволяет offline guessing. Если короткий PIN обязателен, нужен поддерживаемый PAKE и отдельный security design/review до реализации. [RFC 9382](https://www.rfc-editor.org/rfc/rfc9382) описывает SPAKE2, но сам факт наличия RFC не выбирает библиотеку и не доказывает интеграционную безопасность.

### Доверие, reconnect и отзыв устройства

Server хранит grant `{deviceId, clientPublicKey, label, scopes, capabilities, createdAt, revokedAt, revision}`. Client хранит `{serverId, serverPublicKey, grantId, rendezvous endpoint, displayName}` и private client key. Выдача приглашения не передаёт private server key. Private keys и отдельные signaling secrets не экспортируются вместе с `settings.json`; использовать существующую vault boundary, при недоступном secure storage не откатываться к plaintext.

После pairing новый код для reconnect не требуется. На каждом соединении стороны подтверждают сохранённые ключи и свежие nonces; signed/sealed offer-answer включает session ID, expiry, protocol и fingerprints. Для confidential signaling после enrollment нужен **отдельный per-device** secret или проверенный authenticated key agreement; не использовать истёкший invitation key и не делить общий secret между всеми устройствами. Discovery room/capability привязан к grant и может ротироваться. Сервер проверяет grant и разрешения на каждую операцию, не только при handshake. DTLS защищает DataChannel, включая TURN route; binding identity к fingerprints обязателен, иначе шифрование само по себе не доказывает, с каким сервером соединились. [RFC 8831](https://www.rfc-editor.org/rfc/rfc8831), [RFC 8827](https://www.rfc-editor.org/rfc/rfc8827).

Revoke конкретного `deviceId`: сохранить tombstone/revision, закрыть его live channels, отклонять reconnect и запросы, удалить/сменить его signaling capability. Ключи других устройств не меняются. Даже действующие временные TURN credentials не дают доступа к core после revoke; их срок ограничивает сетевое злоупотребление, не application trust. Forget на клиенте удаляет локальный grant/cache, но не заменяет server-side revoke потерянного телефона. Смена server identity требует нового pairing; не принимать новый ключ только потому, что совпало имя. Восстановленные клоны server data не должны одновременно работать с одной identity: процедура восстановления должна это предотвращать.

Старое phone pairing v1 оставить отдельным совместимым путём до миграции. Нельзя считать владельца общего v1 key отдельным известным устройством v2. Предлагать повторное сопряжение; переносить существующее доверие автоматически нельзя. Удаление legacy key прекращает legacy access целиком; v2 grants отзываются по одному. Push и screen-control у старого телефона не доказывают их поддержку новым headless-сервером.

## CLI первого этапа

**Реализовано локально в этой ветке**, ещё не опубликовано. `geckit` обозначает установленный launcher; в standalone bundle команды выполняются как `node /opt/geckit/service/cli.js ...`. Для обычных операторских команд `service` data directory выбирается через `GECKIT_DATA`; команды `access`, `pair`, `devices` также принимают `--data`.

```sh
geckit service run --data /var/lib/geckit
GECKIT_DATA=/var/lib/geckit geckit service projects add /srv/app
geckit access enable --data /var/lib/geckit
geckit pair create --data /var/lib/geckit --project /srv/app --expires 300s --qr
geckit pair pending --data /var/lib/geckit
geckit pair approve <request-id> --phrase <verification-phrase> --data /var/lib/geckit
geckit pair cancel <invitation-id> --data /var/lib/geckit
geckit devices list --data /var/lib/geckit
geckit devices revoke <device-id> --data /var/lib/geckit
geckit access disable --data /var/lib/geckit
```

Нужен существующий поддерживаемый vault headless service; ключ provisioned оператором, не выводится командами pairing. Новый код - 256 случайных бит, 43 base64url символа. TTL по умолчанию 300 секунд, разрешено 1–300 секунд. QR содержит тот же временный invitation. Обязательна сверка phrase перед `approve`. Для истории Manager требуется `--manager` и явный `--project` для каждого зарегистрированного проекта, включая профили; без этого передаётся только summary state Manager.

Добавление/подключение/отключение сервера на desktop и mobile выполняется в общей форме Servers: код или QR, сохранённый сервер, Disconnect, Forget. **`geckit servers add/connect/disconnect/list/forget` пока только предложения для следующего этапа**, не реализованные команды. CLI-клиент удалённого board в этот этап не входит. `--role` не нужен: разрешено только чтение. Control/approvals не передаются. Несколько серверов сохраняются отдельно, активен один.

Production использует существующие managed Firebase rendezvous и TURN endpoint; `--signal http://127.0.0.1:<port>` служит только изолированному E2E mailbox. Произвольный self-hosted HTTPS rendezvous пока не поддержан. При отсутствии TURN остаётся прямой ICE/STUN путь с ограничениями сетей. Issuance не экспортирует постоянный серверный секрет. Trust хранится отдельно: sealed vault на сервере, IndexedDB с nonextractable ключами на клиенте. После рестарта invitations исчезают; доверие устройств сохраняется. После reconnect загружается полный свежий snapshot, durable event replay пока отсутствует.

**Существующий запуск**, подтверждённый кодом, выглядит иначе:

```sh
node /opt/geckit/service/service.js --data /var/lib/geckit
GECKIT_DATA=/var/lib/geckit node /opt/geckit/service/cli.js service status
GECKIT_DATA=/var/lib/geckit node /opt/geckit/service/cli.js service projects list
```

Сейчас это только локальное IPC. Нового code-pairing и `servers connect` нет. Ни один приведённый запуск здесь не выполнялся.

## Данные, события и совместимость (предложение)

Источник истины - **удалённый service и его provider/filesystem state**. Desktop хранит представление и ограниченный cache для чтения. Не копировать `~/.claude`, `~/.codex`, `sessions.json`, configuration или SSH secrets на клиент и не монтировать remote paths как local. Чтение transcript выполняет host-side provider adapter, в том числе для разговоров, начатых на сервере вне GeckIt. Сервер сам обнаруживает изменения диска; P2P не заменяет refresh/watch логику.

### Минимальные wire messages

JSON DTO, явные схемы/валидация/лимиты и бинарные chunks при необходимости; не V8 deserialize из local RPC. Ниже названия **предлагаемые**, не готовый API:

| Сообщение | Поля/назначение |
| --- | --- |
| `hello` | `protocolMajor`, supported minor/features, `buildVersion`, `serverId`, `deviceId`, `epoch`, granted capabilities; идентичность уже аутентифицирована |
| `subscribe` | разрешённые project IDs и topics, последние `epoch/seq` при reconnect |
| `snapshot.begin/page/end` | `snapshotId`, `epoch`, `throughSeq`, scoped projects/session summaries/queue/employees/Manager summary; страничная передача |
| `session.read` / `session.page` | host-scoped session ref, cursor/limit; реальные transcript items, item IDs и revision |
| `event` | `{serverId, epoch, seq, topic, entityRef, revision, payload}`; upsert/delete с явной семантикой |
| `resyncRequired` | потерян буфер/неизвестный epoch/изменились scopes: удалить прежнюю projection и получить snapshot |
| `request` / `receipt` | этап управления: `operationId`, method, entityRef, expected revision; accepted/queued/applied/rejected/unknown |

Snapshot должен иметь согласованную границу: подписаться и ограниченно буферизовать события, снять view в точке `throughSeq`, затем применить только события с большим номером. Если сбор асинхронный, хранить materialized projection с revision или повторять сбор при пересечении изменений; простого «запросить bootstrap, потом подписаться» недостаточно. Длинные transcript pages читаются отдельно с собственным revision/cursor; при изменении revision - reread, не смешивание страниц разных состояний. Не пересылать целиком `settings:changed`/`runtime.current()`; gateway строит scoped DTO и фильтрует **каждое** событие до отправки.

Первый этап не требует durable event log: process `epoch`, bounded ordered event buffer, snapshot на каждом новом соединении. После barrier клиент применяет события, dedup по seq/revision, при gap/overflow resync. Backpressure и лимиты chunks/страниц обязательны; медленный клиент не останавливает service и не растит память бесконечно. Имеющиеся phone 16 KB framing/compression/pagination - кандидаты на повторное использование, а не гарантия суммарных лимитов reassembly.

Reconnect: jitter/backoff с пределом, реакция на sleep/network change, новый authenticated WebRTC link и свежий snapshot. Пока offline - явно устаревший cache с last-seen, управление заблокировано. Работа на сервере продолжается. Ручной disconnect запрещает автоматическое переподключение до connect. Позже bounded replay по `epoch/seq`; при restart/truncated history всё равно snapshot. Не обещать бесшовный ICE restart для выбранной binding до проверки; закрыть и пересоздать соединение - допустимый первый путь. Надёжность DataChannel действует внутри соединения, не через restart.

Будущее управление: никаких автоматических повторов uncertain mutation. Для start/send/approve нужен серверный idempotency journal `deviceId + operationId` вместе с эффектом либо явное reconciliation; read receipt перед retry. Срок хранения journal должен покрывать окно клиентских повторов. Approvals проверяют текущий pending ID/revision, повтор или ответ другому turn отвергается. «Host accepted» отличается от «provider принял» и «работа завершена».

### Несколько серверов и пути

С первого этапа registry поддерживает несколько server identities, но активный board/Manager показывает **один выбранный service**. Это полный первый сценарий без общей распределённой очереди. Local service - ещё один источник; переход не меняет grants. Объединённый board можно добавить позднее.

Ключ cache/UI entity: `(serverId, kind, nativeId)`; для session безопаснее `(serverId, providerId, rootRef, sessionId)`, item - ещё `itemId`; employee, shortcut, Manager thread, pending approval и operation тоже имеют server namespace. `projectRef` содержит serverId + opaque project ID; `path` - host-native metadata, никогда локальный аргумент файловой операции. Server-side маршрутизация определяет настоящий root. Для SSH-проекта внутри service ref сохраняет **оба уровня**: service serverId и его `sshHostId/path`; одинаковый `ssh://devbox/srv/app` у двух service не одна папка.

ServerId не hostname и не IP; переименование/смена сети не создаёт другой источник. Два `/srv/app`, одинаковые session UUID и Windows paths разных серверов не сливаются. Links/files маркируются своим serverId; открыть `/tmp/a` сервера через локальный shell/Trash запрещено. Подключение клиента не регистрирует remote projects в локальном runtime и не создаёт зеркальный Manager. Cache partition удаляется при forget/revoke notification; уже скопированные пользователем данные удалённый отзыв отозвать не может.

Wire version отделить от package version: несовместимый major - остановка до snapshot с понятным сообщением, compatible minor - negotiated features, неизвестные optional поля игнорируются по схеме. В первом выпуске допустим один protocol major и строго проверенная матрица builds; не переносить текущую проверку `packageVersion === desktopVersion` бездумно на мобильный release cycle. Обязательные security features не downgrade; capabilities проверяет сервер, а не версия UI. Host advertises native/provider возможности, клиент не предполагает macOS/Claude. Обновление приложения на клиенте никогда автоматически не останавливает remote service.

## Полномочия: наблюдение отдельно от управления

| Capability | Первый этап | Следующий этап / ограничение |
| --- | --- | --- |
| `observe` | Списки разрешённых проектов и сессий, история по запросу, состояния очереди/работы, сотрудники и Manager summary в рамках scope, pending requests как данные без ответа | Полные Manager threads могут содержать сведения из других проектов: выдавать только явно разрешённые threads или отдельно согласованный server-wide grant. Нельзя фильтровать только карточки и забыть search/history/events. |
| `session.control` | Нет | Start/send/stop/retry/queue в разрешённых проектах; host provider/mode/VPN rules сохраняются; stop тоже mutation. |
| `approval.answer` | Нет | Только явный owner-issued grant, текущий request ID и допустимый native provider ответ; pairing не выдаёт его автоматически. |
| `manager.control` | Нет | Отправка Manager может запускать/менять задачи. Проверять downstream project scopes, не только входной chat. Не разрешать Manager обходить device ACL через свой более широкий локальный CLI. |
| `files.read`, `local.forward` | Нет произвольного доступа; transcript text по observe | Отдельные scope/размер/path traversal/symlink/SSRF проверки, file DTO вместо произвольного path RPC. Не включать localhost HTTP proxy по умолчанию. |
| `configuration.admin`, service lifecycle | Нет | Provider install, credential changes, channels, новые grants, shutdown/import/update не входят в remote control MVP. Управляются локальным оператором. |
| OS/native control | Нет | Capture, clipboard, keyboard, shell, browser, Trash и screen remote-control - отдельные host-local capabilities и permissions, не последствия P2P pairing. |

Read-only доступ тоже раскрывает тексты разговоров, имена и пути. Scope выбирается оператором при invitation, по умолчанию один явно указанный зарегистрированный проект; `--all-projects` требует явного решения. Employee/Manager summaries фильтруются либо не выдаются, если безопасную projection построить нельзя. Устройство не получает полный `settings:get`, `phone:settings`, generic `service call`, migration RPC или broadcast всех core events.

Provider approval разрешает инструмент в provider на сервере и не заменяет системный prompt macOS/Windows/Linux. При отсутствии native adapter возвращать `capability_unavailable`/pending по смыслу операции; не выполнять её на клиентском компьютере. На этапе управления native запросы маршрутизируются только к adapter того же serverId и с явной policy назначения устройства. Аутентифицированный remote desktop не может выдавать себя за локальный trusted operator или завершать `desktop:completeNative`.

## Вспомогательные серверы, видимость и стоимость

P2P описывает путь данных, а не отсутствие инфраструктуры. [ICE RFC 8445](https://www.rfc-editor.org/rfc/rfc8445) использует STUN/TURN; [STUN RFC 8489](https://www.rfc-editor.org/rfc/rfc8489) прямо не является самостоятельным traversal решением; [TURN RFC 8656](https://www.rfc-editor.org/rfc/rfc8656) нужен, когда прямой путь не проходит.

| Компонент | Нужен для выбранного UX | Что видит / что не хранит |
| --- | --- | --- |
| Rendezvous/signaling по HTTPS/WSS | Да: найти online service по коду и обменять sealed offer/answer. Первый вариант - развитие существующего Firebase signal, без DHT и публичного каталога хостов. | IP клиентов/сервера, opaque room/grant routing IDs, время присутствия, размер ciphertext, обращения и корреляцию; публичные identity keys, если они используются для backend auth. Не plaintext SDP/проекты/историю при sealed signaling. Нужны auth, TTL, quota и abuse controls; текущих shape-only Firestore rules недостаточно. |
| STUN | Обычно для внешних candidates, не передаёт application payload | IP/port и время запроса; не проекты/сообщения. Удалённый peer при прямом P2P тоже узнаёт сетевые адреса. |
| TURN | Для fallback при неработающем direct; recommended auto, не обязателен в direct-only | Сетевые endpoint/allocations, credential identifiers, время, объём и зашифрованные пакеты. Не plaintext DataChannel при аутентифицированном DTLS; это вывод из протокола, не гарантия минимальных логов конкретного оператора. |
| GeckIt data backend в облаке | Не нужен | История/состояние остаются на host. Signaling - не второй источник истины и не хранилище задач. |

TURN credential broker выдаёт временные credentials после проверки host/device enrollment и лимитов; для ещё не завершённого pairing - отдельный короткий lease по подтверждённому invitation exchange. Доступ к комнате сам по себе не даёт неограниченный relay credit. Операторский TURN API token остаётся на backend. Текущая функция выдаёт credentials на день по room freshness; для новой функции предлагаются короткие leases с продлением и квотами. [coturn](https://github.com/coturn/coturn/blob/master/README.turnserver) поддерживает временные credentials; self-hosted coturn возможен, но добавит updates, TLS, abuse prevention, мониторинг и bandwidth.

Без обязательного user account backend может аутентифицировать host по зарегистрированному public key и challenge signature; grants/lease запросы подписывает этот host. Саморегистрация не решает Sybil abuse: нужны глобальные лимиты выдачи, квоты и управляемое отключение злоупотребляющих identities. Политика допуска новых host к оплачиваемому relay остаётся отдельным операционным решением. У клиента нет backend token с правом создавать произвольные host/grants.

Для первого этапа рекомендован существующий по направлению managed TURN, а не новый парк relay servers. [Cloudflare TURN](https://developers.cloudflare.com/realtime/turn/) поддерживает UDP/TCP/TLS, включая TLS 443; **конкретный prebuilt binding** обязан пройти forced-relay/TLS тест, наличие параметра API этого не доказывает. Это fallback для многих закрытых сетей, не гарантия обхода всех enterprise proxy/firewall policies.

[Проверенная pricing page](https://developers.cloudflare.com/realtime/sfu/platform/pricing/) указывает $0.05/GB egress и общие первые 1,000 GB/месяц для SFU/TURN. Это ориентир на дату исследования, не проверка billing аккаунта. Пример: 100 GB оплачиваемого TURN egress после allowance - $5, 1 TB в десятичном исчислении - $50. Двусторонний трафик и число получателей надо учитывать по фактическому egress; не умножать вслепую на два. Отдельно оплачиваются signaling/database/functions, логирование и работа сопровождения. Оценка GeckIt: `стоимость ≈ relay egress × тариф + signaling + эксплуатация`; доля relay и bytes/s пока неизвестны. Нужны метрики route type, bytes, connect latency и failure category без SDP/содержимого. Нельзя обещать, что P2P всегда бесплатен или relay почти не используется.

### Режим без relay

Предлагаемый `--relay off` запрещает выдачу TURN credentials и relay candidates; не должно быть скрытого fallback. Соединение возможно в LAN, при доступном IPv6/public endpoint или когда ICE hole punching проходит. Некоторые NAT/firewall сочетания его не пропустят, смена Wi-Fi/mobile может оборвать доступ. Клиент сообщает «Прямой путь недоступен; relay отключён», данные остаются на сервере. STUN/rendezvous при этом всё ещё используются. Режим без **всех** вспомогательных серверов потребует ручного out-of-band discovery/достижимых адресов и не соответствует выбранному «ввёл код и подключился» UX. Self-hosted signaling/STUN/TURN - возможное развитие, а не отсутствие серверов.

## Этапы и критерии результата

1. **Отдельный implementation spike, после принятия направления**: pinned `node-datachannel`, browser interop, headless Linux x64 без GUI и Electron/macOS arm64 client; затем целевые Windows/macOS/Linux варианты. Доказать direct и forced TURN UDP/TCP/TLS 443, revoke live link, смену сети, memory/backpressure, release packaging/licenses. Не писать свой NAT traversal, если binding не проходит: сравнить зафиксированный libp2p/replacement adapter. Этот spike здесь не выполнялся.
2. **Первый полезный выпуск**: CLI выдаёт одноразовый код; mobile и desktop сопрягаются с headless service, выбирают несколько сохранённых серверов по одному; scoped реальные проекты, сессии, transcript, рабочие состояния и безопасный Manager summary; snapshot/live events/reconnect/version errors; отдельный device revoke, direct-only и auto-relay. Нет remote writes. Работы продолжаются после закрытия клиента. Это завершённый сценарий отображения данных, не mock/demo списка.
3. **Явное управление**: отдельные grants, start/send/stop/approve, scoped Manager, operation receipts/idempotency, native ограничения. Ранее read-only устройства не повышаются автоматически. Затем attachments/file access только по отдельному контракту.
4. **По подтверждённой потребности**: durable replay вместо частых snapshots, объединённый board, self-hosted rendezvous/TURN, короткий PIN с PAKE, дополнительные transports. Не вводить distributed storage/CRDT, mesh routing, общий Manager или обязательный account backend ради первого подключения.

Acceptance для будущей реализации: два сервера с одинаковыми project path/session ID не смешиваются; код истекает и используется ровно одним подтверждённым устройством; второй клиент получает отдельный grant; revoked device теряет live/reconnect доступ; скрытые проекты не просачиваются в search/Manager/events; direct и forced relay показывают одни реальные данные; после drop/restart нет пропусков snapshot boundary и повторных отправок; offline client не меняет local runtime; несовместимый протокол отказывается до данных; у headless отсутствующие native функции явно недоступны. Настоящие сервер/provider/physical mobile проверки фиксировать отдельно от fixtures.

## Существенные открытые вопросы

- Достаточно ли первого read-only этапа, или первый выпуск должен уже посылать задания? Рекомендация - чтение первым; управление потребует отдельной готовности ACL/idempotency.
- Принимаем ли длинный код/QR и сверку в server CLI? Рекомендация - да. Требование короткого цифрового PIN изменит security/library scope, не только верстку.
- Первый deployment: Linux x64 server + macOS desktop + iOS/Android client, либо иные OS? Packaging и secure key storage нужно подтвердить на каждой заявленной платформе.
- Область доступа: owner devices или коллеги? Здесь owner devices с project scopes; multi-user roles и передача полномочий не заявлены реализованными.
- Разрешён ли managed Cloudflare/Firebase и в каких регионах, нужен ли self-host с первого выпуска? Production availability/credentials/billing не исследовались. Если managed TURN запрещён, default direct-only уменьшит достижимость, а self-host потребует эксплуатации.
- Что должен раскрывать Manager при project-scoped observe? Без отдельной безопасной projection лучше ограничить summary, чем утечь данными остальных проектов.

Эти вопросы не мешают выбрать направление P2P и server-issued invitation; они определяют границы реализации. В этой задаче изменены только записка, предложенная запись решения и day-plan; продукт не реализовывался и не публиковался.
