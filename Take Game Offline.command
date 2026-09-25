#!/bin/bash
# Double-click: turn off the Cloudflare site and GitHub Pages (asks first).
exec "$(dirname "$0")/scripts/launch.sh" offline
