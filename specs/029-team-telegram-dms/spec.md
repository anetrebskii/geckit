# Team Telegram direct messages
## User scenarios and testing
US1 (P1): A locally admitted participant writes privately while the existing topic remains connected. A and B receive only their own replies and files.
US2 (P1): Slow A does not block B or the topic. Messages within a route retain order and resources remain bounded.
US3 (P1): Owner revokes A; queued work and approvals lose authority immediately, workers are stopped or visibly reported.
US4 (P2): Existing private/topic installations migrate without replay or increased permissions.
## Requirements
FR01 One bot receiver, optional admitted DMs, 32 members plus owner. FR02 One-use 10-minute invitations and exact local confirmation. FR03 Exact immutable route, generation and authority version on requests/workers/responses. FR04 Tools enforce ownership and allowed projects, never private/global owner authority. FR05 Durable handoff before Telegram acknowledgement, deduplicated acceptance and uncertain delivery. FR06 Independent ordered route preparation, bounded fair Manager/worker admission. FR07 All numerical limits and overflow semantics from the approved implementation plan. FR08 Native images and pinned inputs. FR09 Revocation checked after awaits and before side effects, native policies retained. FR10 Owner UI and explicit migration/rollback behavior.
## Success criteria
SC01 A held provider turn does not prevent B and topic progress. SC02 Foreign IDs fail in every tool and transport surface. SC03 Crash matrix has no lost accepted work or blindly replayed effects. SC04 Every resource cap tested at boundary and overflow. SC05 Legacy behavior preserved, new mode off initially.
## Assumptions
Explicit local membership, no group roster synchronization. Trusted shared installation, no OS tenant isolation. No automatic private-to-topic promotion. No live calls or publication authorized.
