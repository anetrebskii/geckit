set -e
cd "$(dirname "$0")"
W=work
rows=""
for k in white-on-green green-on-ink; do
  rsvg-convert -w 300 -b white svg/icon-$k.svg -o $W/$k-512.png
  rsvg-convert -w 300 -b white svg/icon-black.svg -o $W/$k-mono.png
  rsvg-convert -w 300 svg/icon-reversed.svg -o $W/$k-rev.png
  for s in 16 32; do
    rsvg-convert -w $s svg/icon-$k-small.svg -o $W/$k-$s.png
    magick -size ${s}x${s} xc:white $W/$k-$s.png -composite -scale 300x300 $W/$k-${s}x.png
  done
  rsvg-convert -w 110 svg/avatar-$k.svg -o $W/av.png
  magick $W/av.png \( -size 110x110 xc:black -fill white -draw "circle 55,55 55,0" \) -alpha off -compose copy_opacity -composite $W/av-c.png
  rsvg-convert -w 32 svg/avatar-$k.svg -o $W/av32.png
  magick $W/av32.png \( -size 32x32 xc:black -fill white -draw "circle 16,16 16,0" \) -alpha off -compose copy_opacity -composite $W/av32-c.png
  magick -size 300x300 xc:white $W/av-c.png -geometry +30+95 -composite $W/av32-c.png -geometry +200+134 -composite $W/$k-av.png
  magick $W/$k-512.png $W/$k-mono.png $W/$k-rev.png $W/$k-32x.png $W/$k-16x.png $W/$k-av.png -bordercolor "#F3F4F5" -border 10 +append $W/$k-row.png
  rows="$rows $W/$k-row.png"
done
rsvg-convert -h 22 svg/wordmark-light.svg -o $W/w16.png
magick $W/w16.png -scale 500% $W/w16x.png
magick $rows -append $W/rows.png
magick $W/rows.png \( $W/w16x.png -background white -gravity center -extent 1920x140 \) -append geckit-round-14-tests.png
