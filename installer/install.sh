#!/bin/sh
set -eu
base=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_dir="$base/Claude-Usage-Monitor"
if [ ! -f "$source_dir/manifest.json" ]; then
  echo 'Missing extension files. Extract the entire ZIP first.' >&2
  exit 1
fi
case "$(uname -s)" in
  Darwin) target="$HOME/Library/Application Support/Claude-Usage-Monitor/extension" ;;
  *) target="${XDG_DATA_HOME:-$HOME/.local/share}/Claude-Usage-Monitor/extension" ;;
esac
mkdir -p "$target"
# Copy only extension assets; keep this stable path for future updates.
for file in "$source_dir"/*; do cp "$file" "$target/"; done
printf '\nExtension files installed at:\n%s\n\n' "$target"
printf '%s\n' 'Open chrome://extensions (or edge://extensions).' 'Enable Developer mode > Load unpacked > select the folder above.' 'For updates, run this helper again and click Reload on the extension.' 'Chrome requires this final manual step; this helper does not bypass browser policy.'
if [ "$(uname -s)" = Darwin ]; then
  open "$target" || true
  open -a 'Google Chrome' 'chrome://extensions/' 2>/dev/null || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$target" >/dev/null 2>&1 || true
fi
