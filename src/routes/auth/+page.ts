// Sign-in runs against better-auth's browser client and reads the page it should
// return to from client history. Nothing here renders usefully on the server,
// and it must never be prerendered into a static page.
export const ssr = false;
export const prerender = false;
