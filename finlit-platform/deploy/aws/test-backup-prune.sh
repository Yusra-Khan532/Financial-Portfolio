#!/usr/bin/env bash
# The backup retention (deploy/aws/backup.sh prune), checked on a folder of empty dummy dumps: today keeps its newest 3, every earlier day only its newest 1,
# nothing older than KEEP_DAYS days stays, and the newest file is never removed. Run: bash deploy/aws/test-backup-prune.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
fail=0
ok() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1: expected [$3], got [$2]"; fail=1; fi; }
mk() { : > "$T/finlit-$1.dump"; touch -d "$2" "$T/finlit-$1.dump"; }
today="$(date -u +%F)"; d1="$(date -u -d '1 day ago' +%F)"; d2="$(date -u -d '2 days ago' +%F)"; d9="$(date -u -d '9 days ago' +%F)"
for t in 010000 060000 090000 120000; do mk "${today}_$t" "$today ${t:0:2}:00"; done      # 4 today: the 3 newest stay
for t in 020000 140000 203000; do mk "${d1}_$t" "$d1 ${t:0:2}:00"; done                 # 3 yesterday: only 20:30 stays
for t in 080000 203000; do mk "${d2}_$t" "$d2 ${t:0:2}:00"; done                        # 2 the day before: only 20:30 stays
mk "${d9}_203000" "$d9 20:30"                                                            # 9 days old: goes (KEEP_DAYS 7)
BACKUP_DIR="$T" KEEP_DAYS=7 sh "$HERE/backup.sh" prune
left="$(ls -1 "$T" | sort | tr '\n' ' ' | sed 's/ $//')"
ok "today keeps 3, earlier days 1, nothing older than 7 days" "$left" \
  "finlit-${d2}_203000.dump finlit-${d1}_203000.dump finlit-${today}_060000.dump finlit-${today}_090000.dump finlit-${today}_120000.dump"
# OLD_PER_DAY can be raised again without a code change
rm -f "$T"/*; for t in 020000 140000 203000; do mk "${d1}_$t" "$d1 ${t:0:2}:00"; done; mk "${today}_010000" "$today 01:00"
BACKUP_DIR="$T" OLD_PER_DAY=2 sh "$HERE/backup.sh" prune
ok "OLD_PER_DAY=2 keeps two of an earlier day" "$(ls -1 "$T" | wc -l | tr -d ' ')" "3"
# a lone backup is never removed, however old
rm -f "$T"/*; mk "${d9}_203000" "$d9 20:30"
BACKUP_DIR="$T" KEEP_DAYS=7 sh "$HERE/backup.sh" prune
ok "the newest backup is never removed" "$(ls -1 "$T" | wc -l | tr -d ' ')" "1"
exit $fail
