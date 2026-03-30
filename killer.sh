#!/bin/bash

# WARNING: This script will completely wipe the commit history of the specified branch
# and replace it with a single commit containing the current state of the files.

# Set your default branch name here (change to "master" if needed)
BRANCH="main"

echo "⚠️  WARNING: This will DESTROY all commit history on branch '$BRANCH' and force push to origin!"
read -p "Are you absolutely sure you want to proceed? (y/N) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Creating a clean orphan branch..."
    git checkout --orphan temp-new-branch

    echo "Staging all current files..."
    git add -A

    echo "Committing everything as a single blob..."
    git commit -m "Initial commit"

    echo "Deleting the old local '$BRANCH' branch..."
    git branch -D $BRANCH

    echo "Renaming the temporary branch to '$BRANCH'..."
    git branch -m $BRANCH

    echo "Force pushing the new history to the remote repository..."
    git push -f origin $BRANCH

    echo "✅ Success! The repository history has been wiped and replaced with a single commit."
else
    echo "Operation cancelled. Your repository remains unchanged."
fi
