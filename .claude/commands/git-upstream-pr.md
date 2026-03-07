Create a PR from the fork back to the upstream repo (paperclipai/paperclip).

The user will describe what changes they want to contribute. These changes may already exist as commits in the fork or need to be written from scratch.

Steps:
1. Run `git fetch upstream` to get the latest upstream state.
2. Ask the user for a branch name for the contribution (suggest one based on the described changes).
3. Run `git checkout -b <branch-name> upstream/master` to create a clean branch based on upstream — this ensures no fork-specific changes leak into the PR.
4. Apply the changes:
   - If the user points to existing commits, use `git cherry-pick <commit-hash>` to pick them onto the clean branch.
   - If the changes need to be written, implement them on this branch.
   - If the user points to modified files in the fork, selectively bring them in with `git checkout master -- <file>` and review that only the relevant changes are included (not fork-specific modifications).
5. Verify the changes look correct with `git diff upstream/master` — ensure only the intended changes are included, nothing fork-specific.
6. Push the branch: `git push -u origin <branch-name>`.
7. Create the PR: `gh pr create --repo paperclipai/paperclip` with a clear title and description.
8. Show the PR URL to the user.
9. Switch back to master: `git checkout master`.
