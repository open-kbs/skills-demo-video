# Helpers for scripted screen takes with agent-browser. Source it, then:
#   take_start <name> [url]   start recording video/build/rec/<name>.mp4 (cursor shown), reset the marks
#   mark <label>              write "<label> <seconds since take_start>" to <name>.marks (compose.mjs cuts on these)
#   take_stop                 stop and print the marks
#   typeslow "<text>"         type into the focused field with a human rhythm (UTF-8 safe)
#   wait_gone "<regex>" [max] wait until the page snapshot no longer matches (e.g. an AI "thinking…" indicator)
#   card_take <name> <url> <seconds>   record an HTML card (video/cards/*.html) to video/build/rec/card-<name>.mp4
# Viewport is set to 1600×900 (VIEW_W/VIEW_H) before each take; recordings go to absolute paths (the browser daemon has its own cwd).
export LC_ALL=C.UTF-8
REC_DIR="${REC_DIR:-$PWD/video/build/rec}"
mkdir -p "$REC_DIR"
ab() { agent-browser "$@" >/dev/null 2>&1; }

take_start() {
  TAKE="$1"; MARKS="$REC_DIR/$TAKE.marks"; : > "$MARKS"
  ab set viewport "${VIEW_W:-1600}" "${VIEW_H:-900}"
  [ -n "$2" ] && { ab open "$2"; sleep 1; }
  agent-browser record start "$REC_DIR/$TAKE.mp4" --cursor >/dev/null
  T0=$(date +%s%N)
}
mark() { awk -v a="$(date +%s%N)" -v b="$T0" -v l="$1" 'BEGIN { printf "%s %.2f\n", l, (a - b) / 1e9 }' >> "$MARKS"; }
take_stop() { mark end; agent-browser record stop >/dev/null; echo "saved $TAKE: $(tr '\n' ' ' < "$MARKS")"; }

typeslow() {
  local s="$1" i
  for ((i = 0; i < ${#s}; i++)); do agent-browser keyboard type "${s:i:1}" >/dev/null; sleep "${TYPE_DELAY:-0.045}"; done
}

wait_gone() {
  local pat="$1" lim="${2:-60}" i
  sleep 1.5
  for ((i = 0; i < lim; i++)); do
    agent-browser snapshot 2>/dev/null | grep -qE "$pat" || break
    sleep 1
  done
  sleep 1.2
}

card_take() { # name url seconds
  [ -f "$REC_DIR/card-$1.mp4" ] && { echo "skip card $1 (exists)"; return; }
  ab set viewport "${VIEW_W:-1600}" "${VIEW_H:-900}"; ab open "about:blank"; sleep .3
  agent-browser record start "$REC_DIR/card-$1.mp4" "$2" >/dev/null; sleep "$3"; agent-browser record stop >/dev/null
  echo "card $1: $3s"
}
