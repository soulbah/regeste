<script lang="ts">
	// The mark: Newsreader's own [ and R — the exact glyphs of the display face
	// the wordmark is set in, weight 600, outlines baked so nothing depends on
	// the font loading. The bracket carries the accent; the letter carries ink.
	//
	// Why a bracket: the product's most visible artifact is the citation, and a
	// regeste is the register a chancellery kept of its acts. The bracket is
	// both at once, and it overshoots the letter the way punctuation holds text.
	//
	// Generated from the font file (weight 600, gap 130/2000 em) — do not edit
	// the path data by hand; the favicon and PNG icons come from the same
	// pipeline at weight 700.
	let { size = 24, class: klass = '' }: { size?: number; class?: string } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 2036 2036"
	fill="none"
	aria-hidden="true"
	class={klass}
>
	<g transform="translate(76,1847) scale(1,-1) translate(0,249)">
		<path
			class="fill-accent-foreground"
			transform="translate(-179,0)"
			d="M179 -249L179 1410L622 1410L622 1313L369 1313L369 -152L622 -152L622 -249Z"
		/>
		<path
			fill="currentColor"
			transform="translate(494,0)"
			d="M710 740Q824 740 895 800.5Q966 861 966 981Q966 1059 935 1112.5Q904 1166 833.5 1194.5Q763 1223 646 1223L301 1223L332 1352L772 1352Q941 1352 1044 1307Q1147 1262 1193.5 1185Q1240 1108 1240 1012Q1240 922 1198.5 850.5Q1157 779 1076 732.5Q995 686 873 672L873 678Q964 673 1016 650.5Q1068 628 1098.5 582.5Q1129 537 1152 463L1228 222Q1249 157 1269 127.5Q1289 98 1318 90.5Q1347 83 1391 83L1391 -2Q1265 -11 1186.5 -7.5Q1108 -4 1063 16Q1018 36 993 76.5Q968 117 950 183L881 427Q860 502 838.5 542.5Q817 583 783 599.5Q749 616 688 616L326 616L295 740ZM507 1352L507 109L661 55L661 0L79 0L79 55L234 109L234 1243L79 1297L79 1352Z"
		/>
	</g>
</svg>
