#!/usr/bin/env bash

# Ubuntu ARM64 desktop launcher for AIConstructVisualizer.
# It reuses a matching local server, starts one when needed, and opens the page
# in a running browser before falling back to an installed browser.

set -u

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$PROJECT_ROOT/.runtime"
SERVER_LOG="$RUNTIME_DIR/server.log"
LAUNCHER_LOG="$RUNTIME_DIR/launcher.log"
PID_FILE="$RUNTIME_DIR/server.pid"
PORT_FILE="$RUNTIME_DIR/server.port"
DEFAULT_PORT="${AICONSTRUCT_PORT:-4173}"
PROJECT_MARKER='name="application-name" content="AIConstructVisualizer"'
SYSTEMD_UNIT="aiconstructvisualizer-server.service"

mkdir -p "$RUNTIME_DIR"
touch "$LAUNCHER_LOG"

log() {
  printf '%s %s\n' "$(date -Iseconds)" "$*" >> "$LAUNCHER_LOG"
}

show_error() {
  local message="$1"
  log "ERROR: $message"
  if [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] && command -v zenity >/dev/null 2>&1; then
    zenity --error --title="AIConstructVisualizer" --text="$message" >/dev/null 2>&1 || true
  elif [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] && command -v notify-send >/dev/null 2>&1; then
    notify-send --urgency=critical "AIConstructVisualizer" "$message" >/dev/null 2>&1 || true
  fi
  printf 'AIConstructVisualizer: %s\n' "$message" >&2
}

for dependency in python3 curl; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    show_error "Required command '$dependency' is not installed."
    exit 1
  fi
done

exec 9>"$RUNTIME_DIR/launcher.lock"
if command -v flock >/dev/null 2>&1; then
  if ! flock -w 10 9; then
    show_error "Another launcher process did not finish within 10 seconds."
    exit 1
  fi
fi

server_matches_project() {
  local port="$1"
  curl --silent --show-error --fail \
    --connect-timeout 0.4 --max-time 1.2 \
    "http://127.0.0.1:${port}/index.html" 2>/dev/null \
    | grep --fixed-strings --quiet "$PROJECT_MARKER"
}

port_is_open() {
  local port="$1"
  python3 - "$port" <<'PY'
import socket
import sys

with socket.socket() as probe:
    probe.settimeout(0.35)
    raise SystemExit(0 if probe.connect_ex(("127.0.0.1", int(sys.argv[1]))) == 0 else 1)
PY
}

start_server() {
  local port="$1"
  local server_pid=""
  local server_manager="detached"

  log "Starting loopback server on port $port from $PROJECT_ROOT"
  : > "$SERVER_LOG"
  rm -f "$PID_FILE"
  printf '%s\n' "$port" > "$PORT_FILE"

  if command -v systemd-run >/dev/null 2>&1 \
    && systemctl --user show-environment >/dev/null 2>&1; then
    systemctl --user stop "$SYSTEMD_UNIT" >/dev/null 2>&1 || true
    systemctl --user reset-failed "$SYSTEMD_UNIT" >/dev/null 2>&1 || true

    if systemd-run --user \
      --unit="$SYSTEMD_UNIT" \
      --collect \
      --quiet \
      --description="AIConstructVisualizer local web server" \
      --working-directory="$PROJECT_ROOT" \
      --property="StandardOutput=append:$SERVER_LOG" \
      --property="StandardError=append:$SERVER_LOG" \
      python3 -m http.server "$port" \
        --bind 127.0.0.1 \
        --directory "$PROJECT_ROOT"; then
      server_manager="systemd"
      log "Server delegated to transient user unit $SYSTEMD_UNIT"
    else
      log "Transient user unit could not start; falling back to a detached process"
    fi
  fi

  if [[ "$server_manager" == "detached" ]]; then
    if command -v setsid >/dev/null 2>&1; then
      nohup setsid python3 -m http.server "$port" \
        --bind 127.0.0.1 \
        --directory "$PROJECT_ROOT" \
        >> "$SERVER_LOG" 2>&1 < /dev/null &
    else
      nohup python3 -m http.server "$port" \
        --bind 127.0.0.1 \
        --directory "$PROJECT_ROOT" \
        >> "$SERVER_LOG" 2>&1 < /dev/null &
    fi
    server_pid=$!
  fi

  local attempt
  for attempt in {1..30}; do
    if [[ "$server_manager" == "systemd" ]]; then
      server_pid="$(systemctl --user show --property=MainPID --value "$SYSTEMD_UNIT" 2>/dev/null || true)"
    fi
    if server_matches_project "$port"; then
      if [[ "$server_pid" =~ ^[1-9][0-9]*$ ]]; then
        printf '%s\n' "$server_pid" > "$PID_FILE"
      fi
      log "Server ready with PID $server_pid"
      return 0
    fi
    if [[ "$server_manager" == "systemd" ]]; then
      if ! systemctl --user is-active --quiet "$SYSTEMD_UNIT"; then
        show_error "The local server unit exited before it became ready. See $SERVER_LOG"
        return 1
      fi
    elif ! kill -0 "$server_pid" 2>/dev/null; then
      show_error "The local server exited before it became ready. See $SERVER_LOG"
      return 1
    fi
    sleep 0.15
  done

  show_error "The local server did not become ready. See $SERVER_LOG"
  return 1
}

choose_server() {
  local saved_port=""
  if [[ -r "$PORT_FILE" ]]; then
    read -r saved_port < "$PORT_FILE" || true
  fi
  if [[ "$saved_port" =~ ^[0-9]+$ ]] && server_matches_project "$saved_port"; then
    PORT="$saved_port"
    log "Reusing recorded server on port $PORT"
    return 0
  fi

  if [[ "$DEFAULT_PORT" =~ ^[0-9]+$ ]] && server_matches_project "$DEFAULT_PORT"; then
    PORT="$DEFAULT_PORT"
    printf '%s\n' "$PORT" > "$PORT_FILE"
    log "Reusing matching server on default port $PORT"
    return 0
  fi

  if ! [[ "$DEFAULT_PORT" =~ ^[0-9]+$ ]] || (( DEFAULT_PORT < 1024 || DEFAULT_PORT > 65515 )); then
    show_error "AICONSTRUCT_PORT must be a number between 1024 and 65515."
    return 1
  fi

  local candidate
  for ((candidate = DEFAULT_PORT; candidate <= DEFAULT_PORT + 20; candidate++)); do
    if port_is_open "$candidate"; then
      log "Port $candidate is occupied by another service; trying the next port"
      continue
    fi
    PORT="$candidate"
    start_server "$PORT" || return 1
    return 0
  done

  show_error "No free local port was found between $DEFAULT_PORT and $((DEFAULT_PORT + 20))."
  return 1
}

process_is_running() {
  local expression="$1"
  ps -u "$(id -u)" -o comm= 2>/dev/null | grep --extended-regexp --quiet "$expression"
}

launch_command() {
  local command_name="$1"
  shift
  if ! command -v "$command_name" >/dev/null 2>&1; then
    return 1
  fi
  log "Opening $URL with $command_name"
  nohup "$command_name" "$@" "$URL" >/dev/null 2>&1 < /dev/null &
  return 0
}

launch_chromium_family() {
  local command_name
  for command_name in google-chrome-stable google-chrome chromium chromium-browser; do
    if launch_command "$command_name" --new-tab; then
      return 0
    fi
  done
  return 1
}

launch_firefox_family() {
  local command_name
  for command_name in firefox firefox-esr mozilla librewolf; do
    if launch_command "$command_name" --new-tab; then
      return 0
    fi
  done
  return 1
}

launch_other_browser() {
  local command_name
  for command_name in brave-browser brave microsoft-edge-stable microsoft-edge vivaldi epiphany; do
    if launch_command "$command_name" --new-tab; then
      return 0
    fi
  done
  return 1
}

open_browser() {
  # Prefer a browser that already has a process in this desktop session.
  if process_is_running '^(chrome|google-chrome|chromium|chromium-browse)$' && launch_chromium_family; then
    return 0
  fi
  if process_is_running '^(firefox|firefox-esr|mozilla|librewolf)$' && launch_firefox_family; then
    return 0
  fi
  if process_is_running '^(brave|brave-browser|msedge|vivaldi|vivaldi-bin|epiphany)$' && launch_other_browser; then
    return 0
  fi

  # With no known browser running, use the requested Chrome/Chromium ->
  # Firefox/Mozilla -> other-browser preference.
  if launch_chromium_family || launch_firefox_family || launch_other_browser; then
    return 0
  fi
  if launch_command xdg-open; then
    return 0
  fi
  if command -v gio >/dev/null 2>&1; then
    log "Opening $URL with gio"
    nohup gio open "$URL" >/dev/null 2>&1 < /dev/null &
    return 0
  fi
  return 1
}

PORT=""
if ! choose_server; then
  exit 1
fi

URL="http://127.0.0.1:${PORT}/"
printf '%s\n' "$URL"

if [[ "${AICONSTRUCT_NO_BROWSER:-0}" == "1" ]]; then
  log "Browser launch skipped by AICONSTRUCT_NO_BROWSER; URL is $URL"
  exit 0
fi

if ! open_browser; then
  show_error "The server is ready at $URL, but no supported browser opener was found."
  exit 1
fi

log "Launch complete"
