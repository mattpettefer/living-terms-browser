<?php
/**
 * Plugin Name: Living Term Browser
 * Description: Browse posts from living.life.edu, inspect their terms, and organize them into destination categories. Use the [living_term_browser] shortcode.
 * Version: 1.0.0
 * Author: Life University
 * License: GPL-2.0-or-later
 * Text Domain: living-term-browser
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'LTB_PLUGIN_FILE', __FILE__ );
define( 'LTB_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'LTB_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'LTB_DEFAULT_SOURCE_URL', 'https://living.life.edu' );

/**
 * Register the front-end assets. They are only enqueued when the shortcode renders.
 */
function ltb_register_assets() {
	$js  = LTB_PLUGIN_DIR . 'assets/ltb-app.js';
	$css = LTB_PLUGIN_DIR . 'assets/ltb-app.css';

	// Cache-bust with the file modification time so uploads of a new build take effect immediately.
	$js_ver  = file_exists( $js ) ? (string) filemtime( $js ) : '1.0.0';
	$css_ver = file_exists( $css ) ? (string) filemtime( $css ) : '1.0.0';

	wp_register_script( 'ltb-app', LTB_PLUGIN_URL . 'assets/ltb-app.js', array(), $js_ver, true );
	wp_register_style( 'ltb-app', LTB_PLUGIN_URL . 'assets/ltb-app.css', array(), $css_ver );
}
add_action( 'wp_enqueue_scripts', 'ltb_register_assets' );

/**
 * Keep wptexturize from converting quotes inside the shortcode's JSON content.
 *
 * @param string[] $shortcodes Shortcodes excluded from texturizing.
 * @return string[]
 */
function ltb_no_texturize( $shortcodes ) {
	$shortcodes[] = 'living_term_browser';
	return $shortcodes;
}
add_filter( 'no_texturize_shortcodes', 'ltb_no_texturize' );

/**
 * Normalize enclosed shortcode content back into plain JSON text. wpautop and
 * the visual editor may have wrapped it in <p>/<br> tags, encoded entities, or
 * swapped in typographic quotes.
 *
 * @param string $content Raw enclosed content.
 * @return string Cleaned text (possibly empty).
 */
function ltb_clean_seed( $content ) {
	$text = preg_replace( '#<br\s*/?>#i', "\n", (string) $content );
	$text = preg_replace( '#</?p[^>]*>#i', "\n", $text );
	$text = wp_strip_all_tags( $text );
	$text = html_entity_decode( $text, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	$text = str_replace( array( "\xE2\x80\x9C", "\xE2\x80\x9D", "\xE2\x80\x9E" ), '"', $text );
	$text = str_replace( array( "\xE2\x80\x98", "\xE2\x80\x99", "\xE2\x80\x9A" ), "'", $text );
	$text = str_replace( "\xC2\xA0", ' ', $text );
	return trim( $text );
}

/**
 * Shortcode: [living_term_browser source="https://living.life.edu" posts_rest_base="posts"]
 *
 * Enclosing form: [living_term_browser]{ "assignments": { ... } }[/living_term_browser]
 * The inner content is an exported configuration document and is imported by
 * the app on load (replacing the browser's saved assignments the first time
 * that exact content is seen).
 *
 * The app renders inside the returned element and reads its configuration
 * from data attributes, so the same bundle also runs in the local dev shell.
 *
 * @param array<string,string> $atts    Shortcode attributes.
 * @param string|null          $content Enclosed content (configuration JSON), if any.
 * @return string
 */
function ltb_render_shortcode( $atts, $content = null ) {
	$atts = shortcode_atts(
		array(
			'source'          => apply_filters( 'ltb_source_url', LTB_DEFAULT_SOURCE_URL ),
			'posts_rest_base' => 'posts',
		),
		$atts,
		'living_term_browser'
	);

	$source = esc_url_raw( untrailingslashit( $atts['source'] ) );
	if ( '' === $source ) {
		$source = LTB_DEFAULT_SOURCE_URL;
	}
	$rest_base = sanitize_key( $atts['posts_rest_base'] );
	if ( '' === $rest_base ) {
		$rest_base = 'posts';
	}

	if ( ! file_exists( LTB_PLUGIN_DIR . 'assets/ltb-app.js' ) ) {
		if ( current_user_can( 'manage_options' ) ) {
			return '<p><strong>Living Term Browser:</strong> the app bundle is missing. Run <code>npm run build</code> in <code>ltb-app</code> and upload the plugin directory again.</p>';
		}
		return '';
	}

	wp_enqueue_style( 'ltb-app' );
	wp_enqueue_script( 'ltb-app' );

	$seed_html = '';
	$seed      = ltb_clean_seed( $content );
	if ( '' !== $seed ) {
		$decoded = json_decode( $seed, true );
		if ( null === $decoded && JSON_ERROR_NONE !== json_last_error() ) {
			if ( current_user_can( 'edit_posts' ) ) {
				$seed_html .= sprintf(
					'<p class="ltb-seed-error"><strong>Living Term Browser:</strong> the shortcode content is not valid JSON (%s), so it was not imported.</p>',
					esc_html( json_last_error_msg() )
				);
			}
		} else {
			// Re-encode so the embedded JSON is canonical and safe inside a <script> element.
			$seed_html .= '<script type="application/json" data-ltb-seed>' .
				wp_json_encode( $decoded, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP ) .
				'</script>';
		}
	}

	return sprintf(
		'<div data-ltb-app data-source-url="%s" data-posts-rest-base="%s" class="ltb-root">%s<noscript>Living Term Browser requires JavaScript.</noscript></div>',
		esc_attr( $source ),
		esc_attr( $rest_base ),
		$seed_html
	);
}
add_shortcode( 'living_term_browser', 'ltb_render_shortcode' );
