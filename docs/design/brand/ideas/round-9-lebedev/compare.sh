set -e
cd "$(dirname "$0")"
R8=../round-8-harness/svg
W=work
mkdir -p $W svg
sed -E 's/<rect width="256" height="256" rx="58" fill="#16191D"\/>//; s/fill="#[0-9A-Fa-f]{6}"/fill="#000000"/g' $R8/offset-green.svg > svg/offset-black.svg
cp $R8/offset-green.svg svg/offset.svg
cp $R8/g.svg svg/g.svg; cp $R8/g-mono-black.svg svg/g-black.svg
cp $R8/frame.svg svg/frame.svg; cp $R8/frame-mono-black.svg svg/frame-black.svg
for k in a-foot offset g frame; do
  sed 's/fill="#000000"/fill="#FFFFFF"/g; s/fill="#000"/fill="#FFFFFF"/g; s/stroke="#000"/stroke="#FFFFFF"/g' svg/$k-black.svg > $W/$k-white.svg
  rsvg-convert -w 360 -b white svg/$k.svg -o $W/c-$k-360.png
  rsvg-convert -w 360 -b white svg/$k-black.svg -o $W/c-$k-mono.png
  rsvg-convert -w 360 -b "#16191D" $W/$k-white.svg -o $W/c-$k-rev.png
  for s in 16 32; do
    rsvg-convert -w $s svg/$k.svg -o $W/c-$k-$s.png
    magick -size ${s}x${s} xc:white $W/c-$k-$s.png -composite -scale 360x360 $W/c-$k-${s}x.png
  done
  rsvg-convert -w 16 svg/$k-black.svg -o $W/c-$k-16m.png
  magick -size 16x16 xc:white $W/c-$k-16m.png -composite -scale 360x360 $W/c-$k-16mx.png
  magick $W/c-$k-360.png $W/c-$k-mono.png $W/c-$k-rev.png $W/c-$k-32x.png $W/c-$k-16x.png $W/c-$k-16mx.png -bordercolor "#F3F4F5" -border 12 +append $W/c-$k-row.png
done
magick $W/c-a-foot-row.png $W/c-offset-row.png $W/c-g-row.png $W/c-frame-row.png -append geckit-round-9-compare.png
