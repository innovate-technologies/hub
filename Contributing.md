# Contributing

## License

Hub is licensed under the AGPLv3. By contributing, you agree that any code that you contribute
will be licensed under the AGPLv3.

## Coding style

There is no formal style guide to follow. Instead:

* Line lengths should ideally be kept below 100 characters.
* Follow the existing code style as much as possible.
* Run ESLint with the project's configuration. Your code should pass ESLint.

## Code

* This project uses ES6/ES7 features. Using them is recommended.
* Instead of callbacks and manually using promises, please use [async/await](https://jakearchibald.com/2014/es7-async-functions/) instead.
* If something can be made `const`, use `const` instead of `let`. Avoid `var`.
* Use [type annotations](https://flowtype.org/docs/type-annotations.html) whenever possible.
* Any code should pass ESLint, as it checks for common code issues in addition to style issues.

## Commit messages

Commit messages should be [descriptive and well-formed](http://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html).

The first line should be written in the imperative, like this: "Fix bug in XYZ",
without a full stop at the end.

Explain what you changed and why (if applicable).
You do not need to specify which files were changed (git already keeps track of this).
