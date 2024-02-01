# @elek-io/core

[![codecov](https://codecov.io/gh/elek-io/core/graph/badge.svg?token=GSZIZMVG6Q)](https://codecov.io/gh/elek-io/core)

Handles core functionality of elek.io Projects like file IO and version control.

```
|-- src
|   |-- error
|   |   Different classes extending Error.
|   |-- service
|   |   Contains CRUD logic that does file-io as well as utility functions.
|   |   The methods are mostly used as endpoints
|   |   so their input is validated against a zod schema.
|   |-- test
|   |   Additional files only used for testing.
|   |-- upgrade
|   |   Files containing logic to upgrade each Project to support a higher Core version.
|   |   This may include iterating over all Assets to add a new key / value
|   |   because the new Core version uses it to store additional information.
|   |-- util
|   |   Utility functions like path generation.
|   |-- index.ts
|   |   Exports ElekIoCore main class which makes the services endpoints accessible.
```

## The concept behind Projects, Collections, Entries, Values and Assets

```
|-- Project (e.g. Website)
|   |-- Collection (e.g. Blog)
|   |   |-- Entry (e.g Post)
|   |   |   |-- Value (e.g for a post's title: "Quarterly results 7% higher than expected")
```

### Projects

Are a container for Collections, Entries, Values and Assets. Think of a folder containing all the relevant files. Projects are version controlled with git, so you can roll back to previous versions of files at any time.

### Collections

Contains ValueDefinitions (a schema) for possible Values each Entry can or has to have.
e.g. for a Blog, it could have the following definition for each post / Entry:

- an image that is displayed on top of the post
- a title to catch users attention
- content that contains multiple headlines and paragraphs
- an author that wrote the post

Each definition like the title, contains additional information for the input field, that is used to modify it's Value.
e.g. the title would be a simple one line input field, that has a maximum lenght of 150 characters and is required for each post. But the content is a markdown editor to easily add formatting. The image let's the user select a jpeg or png from disk. And the author is a reference to another Collection's Entry, so the user is able to choose one of them.

### Entries

Contains references to Values that follow the Collection's ValueDefinitions. Why references and not the Values itself? To make Values reusable for different Entries and even Collections - so when you update a Value, it updates everywhere you've referenced it.

### Values

Represent a single piece of data like the string "How to be successfull in 3 easy steps", a number or a boolean.

### Assets

Are files / blobs like images (png, jpeg etc.), documents (excel sheets etc.), music or a compressed folder.
Assets have two files inside the Project's repository - the actual file and additionally a file containing meta information like the size.
