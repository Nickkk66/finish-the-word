#!/bin/bash
# Double-click: test, upload to Cloudflare, save to GitHub, and turn GitHub Pages on.
exec "$(dirname "$0")/scripts/launch.sh" online
