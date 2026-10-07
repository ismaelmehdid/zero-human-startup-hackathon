#!/usr/bin/env bash
# Upload standing briefs to the RocketRide file store (development account) at the same path as in the repo,
# which is where each pipeline's filestore_source reads them.
#   bash scripts/upload-briefs.sh                     uploads briefs/bench.md (or: npm run briefs)
#   bash scripts/upload-briefs.sh briefs/hunter.md    uploads only the given files
# briefs/hunter.md is not uploaded by default: hunter manages its dev copy in the store, and the repo copy
# replaces it only in `npm run demo` and `npm run run:hunter`.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$#" -gt 0 ]; then
	files=("$@")
else
	files=(briefs/bench.md)
fi

redact() { sed -E 's/rr_[A-Za-z0-9]+/rr_***/g'; }

for file in "${files[@]}"; do
	if [ ! -f "$file" ]; then
		echo "Missing local file: $file" >&2
		exit 1
	fi
	echo "Uploading $file"
	npx --no -- rocketride store write "$file" --file "$file" 2>&1 | redact
	npx --no -- rocketride store stat "$file" 2>&1 | redact
done
