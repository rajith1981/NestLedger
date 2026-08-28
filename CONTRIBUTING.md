# Repository Ground Rules & Collaboration Protocol

Welcome to our project repository! To ensure smooth collaboration, keep our code clean, and prevent us from stepping on each other's toes, we follow these core ground rules.

---

## 1. Workflow & Branching Strategy
Never push code directly to `main`. Always use feature branches.

* **Main Branch (`main`):** This branch must always remain stable and deployment-ready.
* **Feature Branches:** Create a descriptive branch for every new task, bug fix, or experiment.
  * Naming convention: `feature/short-description` or `fix/short-description`
  * Example: `git checkout -b feature/user-authentication`

---

## 2. Code Contribution & Pull Requests (PRs)
When your feature or fix is ready:

1. Push your branch to GitHub.
2. Open a **Pull Request (PR)** targeting `main`.
3. Request a review from your collaborator. 
4. **Never merge your own PR without a review.** Use this time to discuss architecture, catch bugs, and share knowledge.

---

## 3. Commit Guidelines
Write clean, atomic, and descriptive commit messages so we can easily track history.

* **Format:** Start with a short prefix (`feat`, `fix`, `refactor`, `docs`) followed by a concise description.
* **Examples:**
  * `feat: add user login form validation`
  * `fix: resolve token expiration bug on dashboard`
  * `docs: update setup instructions in README`
* Commit frequently in small, logical chunks rather than dumping massive changes all at once.

---

## 4. Task Management & Communication
* **GitHub Issues:** Break features down into individual GitHub Issues before coding.
* **Kanban Board:** Track our progress using a simple GitHub Project board (`To Do` → `In Progress` → `Done`) to prevent duplicating work.
* **Sync Up:** Communicate clearly before tackling overlapping parts of the codebase to avoid merge conflicts.

---

## 5. Security & Repository Hygiene
* **No Secrets in Code:** **Never** commit API keys, passwords, database URIs, or tokens. Always use `.env` files locally and ensure `.env` is listed in your `.gitignore`.
* **Keep Documentation Fresh:** Update the `README.md` whenever you add new dependencies, environment variables, or setup steps so we can both easily run each other's code.
