Sync the local repo with the upstream (paperclipai/paperclip) using merge strategy.

Steps:
1. Run `git fetch upstream` to get the latest upstream changes.
2. Run `git status` to check for uncommitted local changes. If there are any, stash them with `git stash push -m "auto-stash before upstream sync"`.
3. Run `git log --oneline HEAD..upstream/master | wc -l` to count incoming commits.
4. Run `git merge upstream/master` to merge upstream changes.
5. If there are conflicts:
   a. Run `git diff --name-only --diff-filter=U` to list conflicted files.
   b. For each conflicted file, read it and understand both sides of the conflict.
   c. Our fork's changes (HEAD) take priority for files we intentionally modified. Upstream changes take priority for files we haven't touched.
   d. If `git rerere` has auto-resolved some conflicts, verify the resolution looks correct.
   e. Show each conflict to the user with your proposed resolution and ask for approval before applying.
   f. After resolving all conflicts, stage the files and complete the merge with `git commit --no-edit`.
6. If the merge succeeds, run `git push origin master` to push the updated branch to the fork.
7. If changes were stashed in step 2, run `git stash pop` to restore them.
8. Show a summary: how many new upstream commits were merged, which files had conflicts (if any), and whether local changes were preserved.
