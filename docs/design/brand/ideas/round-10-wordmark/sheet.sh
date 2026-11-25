set -e
cd "$(dirname "$0")"
S=/private/tmp/claude-501/-Users-alex-Projects-mine-geckit/fea01108-96a6-4a7f-a4c0-53ce738fdbc8/scratchpad/venv/bin/python
$S build.py
W=work
for k in a-antiqua b-slab-i c-it; do
  rsvg-convert -w 300 -b white svg/$k-icon.svg -o $W/$k-512.png
  rsvg-convert -w 300 -b white svg/$k-icon-black.svg -o $W/$k-mono.png
  rsvg-convert -w 300 svg/$k-icon-reversed.svg -o $W/$k-rev.png
  for s in 16 32; do
    rsvg-convert -w $s svg/$k-icon.svg -o $W/$k-$s.png
    magick -size ${s}x${s} xc:white $W/$k-$s.png -composite -scale 300x300 $W/$k-${s}x.png
  done
  rsvg-convert -h 90 svg/$k-lockup-light.svg -o $W/$k-ll.png
  rsvg-convert -h 90 svg/$k-lockup-dark.svg -o $W/$k-ld.png
  rsvg-convert -h 22 svg/$k-wordmark-light.svg -o $W/$k-w16.png
  magick $W/$k-w16.png -scale 400% $W/$k-w16x.png
  magick $W/$k-ll.png $W/$k-ld.png $W/$k-w16x.png -background white -gravity west -append -resize x300 -extent 620x300 $W/$k-locks.png
  magick $W/$k-512.png $W/$k-mono.png $W/$k-rev.png $W/$k-32x.png $W/$k-16x.png $W/$k-locks.png -bordercolor "#F3F4F5" -border 10 +append $W/$k-row.png
done
magick $W/a-antiqua-row.png $W/b-slab-i-row.png $W/c-it-row.png -append geckit-round-10-tests.png
