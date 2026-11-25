set -e
cd "$(dirname "$0")"
python3 marks.py
W=work
rows=""
for k in a-suit a2-suit-red b-tie c-org; do
  rsvg-convert -w 300 -b white svg/$k.svg -o $W/$k-512.png
  rsvg-convert -w 300 -b white svg/$k-black.svg -o $W/$k-mono.png
  rsvg-convert -w 300 svg/$k-reversed.svg -o $W/$k-rev.png
  for s in 16 32; do
    rsvg-convert -w $s svg/$k.svg -o $W/$k-$s.png
    magick -size ${s}x${s} xc:white $W/$k-$s.png -composite -scale 300x300 $W/$k-${s}x.png
  done
  rsvg-convert -w 16 -b white svg/$k-black.svg -o $W/$k-16m.png
  magick $W/$k-16m.png -scale 300x300 $W/$k-16mx.png
  magick $W/$k-512.png $W/$k-mono.png $W/$k-rev.png $W/$k-32x.png $W/$k-16x.png $W/$k-16mx.png -bordercolor "#F3F4F5" -border 10 +append $W/$k-row.png
  rows="$rows $W/$k-row.png"
done
magick $rows -append geckit-round-13-tests.png
