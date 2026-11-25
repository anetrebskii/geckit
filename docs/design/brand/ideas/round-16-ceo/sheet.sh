cd "$(dirname "$0")/work"
for n in a-card-g a2-card-out c-kanban-first b-stack d-handoff; do
  magick ${n}-tile-512.png -resize 256x256 ${n}-mono-512.png -resize 256x256 ${n}-reversed-512.png -resize 256x256 ${n}-tile-32-zoom.png ${n}-tile-16-zoom.png ${n}-mono-16-zoom.png ${n}-reversed-16-zoom.png +append -bordercolor '#F2F3F5' -border 6 row-$n.png
done
magick row-c-kanban-first.png row-a-card-g.png row-a2-card-out.png row-b-stack.png row-d-handoff.png -append ../geckit-round-16-tests.png
