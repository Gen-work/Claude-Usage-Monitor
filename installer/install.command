#!/bin/sh
base=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
/bin/sh "$base/install.sh"
result=$?
printf '\nPress Enter to close...'
read -r answer
exit "$result"
