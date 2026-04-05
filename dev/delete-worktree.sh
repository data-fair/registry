#!/bin/bash

BRANCH_NAME=$1

if [ -z "$BRANCH_NAME" ]; then
    echo "Error: Please provide a branch name."
    echo "Usage: ./dev/delete-worktree.sh feat-xyz"
    exit 1
fi

REPO_NAME=$(basename "$PWD")
TARGET_DIR="../${REPO_NAME}_${BRANCH_NAME}"

echo "Deleting worktree at $TARGET_DIR"
git worktree remove "$TARGET_DIR" --force
