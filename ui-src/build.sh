#!/bin/sh
# Builds the screen from its parts:
#   ../hub/ui.html   the page the hub serves (live data)
#   demo.html        the same page playing a scripted demo (no hub needed)
#   ../hub/guide.html the manual, from guide.html
# fc1.js opens the script and its closure; fc-end.js boots and closes it.
cd "$(dirname "$0")" || exit 1
{ printf '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="referrer" content="no-referrer">\n'
  cat fc-head.html; printf '</head>\n<body>\n'; cat fc-body.html
  printf '<script>window.FOGCAST={live:true};</script>\n'
  cat fc1.js fc2.js fc3.js fc4.js fc5-live.js fc-end.js; printf '</body>\n</html>\n'; } > ../hub/ui.html
{ printf '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  cat fc-head.html; printf '</head>\n<body>\n'; cat fc-body.html
  cat fc1.js fc2.js fc3.js fc4.js fc-end.js; printf '</body>\n</html>\n'; } > demo.html
# the guide: guide.html is the page as published on its own (no doctype; a host adds one);
# the hub serves it with the head it needs, split at the <!-- body --> marker
{ printf '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="referrer" content="no-referrer">\n'
  sed -n '1,/<!-- body -->/p' guide.html | sed '$d'; printf '</head>\n<body>\n'
  sed -n '/<!-- body -->/,$p' guide.html | sed '1d'; printf '</body>\n</html>\n'; } > ../hub/guide.html
echo "built ../hub/ui.html, ../hub/guide.html and demo.html"
