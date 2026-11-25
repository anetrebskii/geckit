set -e
cd "$(dirname "$0")"
W=work
F="/System/Library/Fonts/Avenir Next.ttc"
for k in a-foot b-edge c-whole; do
  rsvg-convert -w 360 -b white svg/$k.svg -o $W/$k-360.png
  rsvg-convert -w 360 -b white svg/$k-black.svg -o $W/$k-mono.png
  rsvg-convert -w 360 -b white svg/$k-reversed.svg -o $W/$k-rev.png
  for s in 16 32; do
    rsvg-convert -w $s svg/$k.svg -o $W/$k-$s.png
    magick -size ${s}x${s} xc:white $W/$k-$s.png -composite -scale 360x360 $W/$k-${s}x.png
    magick -size ${s}x${s} xc:"#1A1D21" $W/$k-$s.png -composite -scale 360x360 $W/$k-${s}d.png
  done
  rsvg-convert -w 96 svg/$k.svg -o $W/$k-96.png
  magick -size 720x180 xc:white $W/$k-96.png -geometry +40+42 -composite -font "$F" -weight 600 -pointsize 80 -fill "#16191D" -annotate +160+118 "GeckIt" $W/$k-lockL.png
  magick -size 720x180 xc:"#1A1D21" $W/$k-96.png -geometry +40+42 -composite -font "$F" -weight 600 -pointsize 80 -fill white -annotate +160+118 "GeckIt" $W/$k-lockD.png
  magick $W/$k-lockL.png $W/$k-lockD.png -append $W/$k-lock.png
  magick $W/$k-360.png $W/$k-mono.png $W/$k-rev.png $W/$k-32x.png $W/$k-16x.png $W/$k-16d.png $W/$k-lock.png -bordercolor "#F3F4F5" -border 12 +append $W/$k-row.png
done
magick work/a-foot-row.png work/b-edge-row.png work/c-whole-row.png -append geckit-round-9-tests.png
