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
