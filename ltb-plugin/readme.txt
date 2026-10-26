=== Living Term Browser ===
Contributors: lifeuniversity
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later

Browse posts from living.life.edu, inspect their categories and tags, and organize those terms into six destination categories.

== Description ==

Place the shortcode on any page:

    [living_term_browser]

Optional attributes:

* `source` — the WordPress site to read from (default `https://living.life.edu`).
* `posts_rest_base` — REST base of the post type (default `posts`).

The app reads the source site's public REST API from the visitor's browser. Term-to-destination mapping is stored in the browser's localStorage, keyed by source URL, and can be exported/imported as JSON from the Config view.

== Build ==

This directory is produced by `npm run build` in `ltb-app`. Only `assets/`, `living-term-browser.php`, and this file are needed on the server.

== Temporary filter matching ==

Each named filter in the secondary bar has an OR/AND toggle. OR (the default)
matches any selected term; AND requires every selected term. The active
temporary filter narrows the selected destination's results. No Filter and
empty filters leave those results unchanged. Destination assignments still
use their original OR matching.

The operator is saved with the filter and included in configuration exports.
Add "operator": "AND" to an individual filter in imported or shortcode JSON:

{
  "assignments": {},
  "tempFilters": {
    "filters": [
      {
        "id": "tf-example",
        "name": "My filter",
        "termKeys": ["category:123", "post_tag:456"],
        "operator": "AND"
      }
    ],
    "activeId": "tf-example",
    "enabled": true
  }
}

Replace the example term IDs with real source IDs. Use "OR" to match any term.
Older filters without an operator default to OR. The lenient import parser
also treats unrecognized operator values as OR.

== Source term availability ==

All source categories and tags are available for assignment and temporary
filters, including Slice of LIFE, Faces of LIFE, FACES of LIFE FRIDAY, and
Podcast. The previous name-based exclusions no longer apply.
== Post selections ==

Overview continues to group posts by their source-term assignments. The middle
Selections tab has All Posts and the same six destination tabs, using each
post's explicit selection instead. All Posts includes posts with no selection.

The six colored buttons above each card's category divider choose one
destination. Selecting another replaces it; clicking the active choice clears
it. The solid button is selected and the other buttons are faded. Hover for
full category names. Choices are saved locally and are included in JSON and
shortcode exports as postSelections, keyed by source post ID.

Importing older configurations without postSelections preserves current
choices. With postSelections present, Replace replaces the choices and Merge
merges them. Term-mapping edits never overwrite explicit post selections.
Overview destination tabs include Select all. It assigns every post matching
that destination and the active temporary filter, including cards behind
Show more. The action waits for the complete source post index and stays
disabled if loading fails. Matching posts' existing destination choices are
replaced; nonmatching posts and source-term assignments are unchanged.
Deselect all is available in destination sections of both Overview and
Selections. It clears that destination's choices across the full matching
set, including cards behind Show more, and respects the temporary filter.
Choices for other destinations are preserved. Like Select all, it waits for
the complete post index before becoming available.