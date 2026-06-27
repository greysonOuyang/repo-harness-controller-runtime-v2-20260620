#!/usr/bin/env bash

repo_harness_default_controller_home() {
  local repo_root="${1:?repo root is required}"
  printf '%s\n' "$repo_root/_ops/controller-home"
}

repo_harness_use_local_controller_home() {
  local repo_root="${1:?repo root is required}"
  if [[ -z "${REPO_HARNESS_CONTROLLER_HOME:-}" ]]; then
    export REPO_HARNESS_CONTROLLER_HOME
    REPO_HARNESS_CONTROLLER_HOME="$(repo_harness_default_controller_home "$repo_root")"
  fi
  mkdir -p "$REPO_HARNESS_CONTROLLER_HOME"
}
