
/**
 * A generic failure shape matching the API's validation-error format, used
 * when a request never reaches the server (e.g. offline, DNS failure, bad
 * JSON body) so callers always get a consistent errors object to render.
 *
 * @param {String} message
 * @returns {Object}
 */
function connection_error(message) {
    return { errors: { general: [message || 'Unable to reach Full Sort. Please check your connection and try again.'] } };
}

/**
 * Remove data stored in local chrome storage
 *
 * @returns {Promise}
 */
function logout() {
    return chrome.storage.local.clear()
        .then(function(data) {
            return data;
        })
        .catch(err => console.log(err));
}

/**
 * Authenticate user using provided credentials
 *      On success, store credentials and token in chrome local storage
 *
 * @param {type} user_info
 * @returns {Promise}
 */
function sign_in(user_info) {
    const formData = new FormData();

    if (user_info === undefined || !user_info.hasOwnProperty('email') || !user_info.hasOwnProperty('pass')) {
        return new Promise(resolve => {
            resolve('fail');
        });
    }

    formData.append('email', user_info.email);
    formData.append('password', user_info.pass);

    return fetch('https://app.fullsort.com/api/auth/login', {
        method: 'POST',
        body: formData,
        headers: {
            'Accept': 'application/json'
        }
    })
    .then(res => {
        return new Promise(resolve => {
            if (res.status !== 200) {
                resolve('fail');
                return;
            }

            res.json()
                .then(function(data) {
                    chrome.storage.local.set({ 'user_info': user_info, 'token': data.token }, function (response) {
                        if (chrome.runtime.lastError) {
                            resolve('fail');
                            return;
                        }
                        resolve('success');
                    });
                })
                .catch(function(reason) {
                    console.log(reason);
                    resolve('fail');
                });
        });
    })
    .catch(function(reason) {
        console.log(reason);
        return 'fail';
    });
}

/**
 * Authenticate the user via a third-party provider using Full Sort's
 * existing web-based OAuth flow (the same Google/Facebook "Connect" options
 * available on fullsort.com), via the app's named routes:
 *      GET /redirect/{provider}  (redirect.provider)
 *      GET /callback/{provider}  (provider.callback)
 *
 *      Opens the redirect.provider route for the given provider, in a small
 *      Chrome popup window sized by SOCIAL_AUTH_WINDOW below, passing along
 *      the extension's chromiumapp.org redirect URI. Full Sort completes the
 *      provider handshake on its own servers and, once provider.callback
 *      finishes, is expected to redirect back to that URI with a `token`
 *      query param on success. We watch the popup's own tab for that
 *      redirect (see watch_auth_window below) rather than using
 *      chrome.identity.launchWebAuthFlow, since that API opens a
 *      Chrome-managed window whose size can't be customized - on many
 *      displays it ends up taking up most of the screen. On success, store
 *      the token in chrome local storage the same way sign_in() does.
 *
 *      IMPORTANT - backend dependency: as of this writing,
 *      Auth\RegisterController@provider_callback only completes a
 *      session-cookie web login and does not redirect back to an external
 *      redirect_uri with a token. This extension-side flow cannot complete
 *      until that controller (in the fullsort.com codebase, not this repo)
 *      is updated to: (1) thread a `redirect_uri` param from
 *      redirect.provider through the provider round-trip (e.g. via
 *      Socialite's state), and (2) when one is present, issue an API token
 *      (as /api/auth/login does) and redirect to it as
 *      `{redirect_uri}?token={token}` instead of (or in addition to)
 *      logging in a web session. Until then, watch_auth_window below will
 *      never see a matching redirect and this will always resolve 'fail'.
 *
 *      Note: unlike email/password sign-in, the resulting user_info has no
 *      `email`/`pass` fields, so silent_reauth()'s credential-based fallback
 *      below can't refresh an expired social-login session - but its
 *      refresh_token() call comes first and works for any login method (it
 *      only needs the token itself, not credentials), so this only sends
 *      the user back to sign-in.html once the token is past its API-side
 *      refresh_ttl too.
 *
 * @param {String} provider 'google' or 'facebook'
 * @returns {Promise}
 */
function social_sign_in(provider) {
    if (provider !== 'google' && provider !== 'facebook') {
        return new Promise(resolve => {
            resolve('fail');
        });
    }

    const redirect_uri = chrome.identity.getRedirectURL();
    const auth_url = 'https://app.fullsort.com/redirect/' + provider +
        '?redirect_uri=' + encodeURIComponent(redirect_uri);

    return open_auth_window(auth_url, redirect_uri)
        .then(response_url => {
            if (!response_url) {
                return 'fail';
            }

            let token;
            try {
                token = new URL(response_url).searchParams.get('token');
            } catch (err) {
                console.log(err);
                return 'fail';
            }

            if (!token) {
                return 'fail';
            }

            return chrome.storage.local.set({ 'user_info': { provider: provider }, 'token': token })
                .then(() => 'success')
                .catch(err => {
                    console.log(err);
                    return 'fail';
                });
        });
}

/**
 * Size (in pixels) of the popup window used for the social-login OAuth
 * flow. Kept small and fixed rather than matching the browser window, since
 * chrome.identity.launchWebAuthFlow's own window can't be resized and often
 * ends up covering most of the screen.
 */
const SOCIAL_AUTH_WINDOW = { width: 480, height: 640 };

/**
 * Open `auth_url` in a small, fixed-size popup window and watch it for a
 * top-level navigation to `redirect_uri`. Resolves with the full redirect
 * URL (including its query string) once that navigation happens, or with
 * null if the user closes the window first or the window fails to open.
 *
 * This stands in for chrome.identity.launchWebAuthFlow, which performs the
 * same "watch for a redirect back to the extension" job but always in a
 * Chrome-managed window whose size we don't control.
 *
 * @param {String} auth_url
 * @param {String} redirect_uri
 * @returns {Promise<String|null>}
 */
function open_auth_window(auth_url, redirect_uri) {
    return chrome.windows.getLastFocused()
        .catch(() => null)
        .then(parent_window => {
            const position = {};
            if (parent_window && typeof parent_window.left === 'number') {
                position.left = Math.round(parent_window.left + (parent_window.width - SOCIAL_AUTH_WINDOW.width) / 2);
                position.top = Math.round(parent_window.top + (parent_window.height - SOCIAL_AUTH_WINDOW.height) / 2);
            }

            return new Promise(resolve => {
                let settled = false;
                let auth_window_id = null;

                function finish(result) {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    chrome.tabs.onUpdated.removeListener(on_updated);
                    chrome.windows.onRemoved.removeListener(on_removed);
                    if (auth_window_id !== null) {
                        chrome.windows.remove(auth_window_id).catch(() => {});
                    }
                    resolve(result);
                }

                function on_updated(tab_id, change_info, tab) {
                    if (auth_window_id === null || tab.windowId !== auth_window_id || !change_info.url) {
                        return;
                    }
                    if (change_info.url.indexOf(redirect_uri) === 0) {
                        finish(change_info.url);
                    }
                }

                function on_removed(window_id) {
                    if (window_id === auth_window_id) {
                        finish(null);
                    }
                }

                chrome.tabs.onUpdated.addListener(on_updated);
                chrome.windows.onRemoved.addListener(on_removed);

                chrome.windows.create(Object.assign(
                    { url: auth_url, type: 'popup' },
                    SOCIAL_AUTH_WINDOW,
                    position
                ))
                .then(created_window => {
                    if (settled) {
                        // The window was already closed/matched before creation resolved.
                        return;
                    }
                    auth_window_id = created_window.id;
                })
                .catch(err => {
                    console.log('Failed to open social-login auth window:', err);
                    finish(null);
                });
            });
        });
}

/**
 * Validate the stored token
 *
 * @returns {Promise}
 */
function validate_token() {
    return chrome.storage.local.get('token')
        .then(res => {
            return fetch('https://app.fullsort.com/api/auth/check', {
                method: 'POST',
                body: {'body' : 'empty'},
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + res.token
                }
            })
            .then(res => {
                return new Promise(resolve => {
                    if (res.status !== 200) {
                        resolve('invalid');
                        return;
                    }

                    resolve('valid');
                });
            })
            .catch(err => {
                console.log(err);
                return 'invalid';
            });
        });
}

/**
 * Return credentials in chrome local storage
 *
 * @returns {Promise}
 */
function get_stored_credentials(key) {
    return chrome.storage.local.get(key)
        .then(res => {
            return new Promise(resolve => {
                resolve(res[key]);
            });
        });
}

/**
 * Exchange the stored (possibly expired) token for a new one via
 * POST /api/auth/refresh, without needing credentials of any kind - it
 * works for any login method, including social logins, since it only
 * needs the token itself. Succeeds as long as the token is still within
 * the API's refresh_ttl (14 days as of this writing, see FullSort.Dev's
 * config/jwt.php) and hasn't been blacklisted; fails the same way an
 * expired/invalid token does otherwise (a non-200 response).
 *
 * @returns {Promise<String>} 'success' or 'fail'
 */
function refresh_token() {
    return chrome.storage.local.get('token')
        .then(res => fetch('https://app.fullsort.com/api/auth/refresh', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + res.token
            }
        }))
        .then(res => {
            if (res.status !== 200) {
                return 'fail';
            }

            return res.json()
                .then(data => chrome.storage.local.set({ 'token': data.token }))
                .then(() => 'success')
                .catch(err => {
                    console.log(err);
                    return 'fail';
                });
        })
        .catch(err => {
            console.log(err);
            return 'fail';
        });
}

/**
 * Attempt to silently refresh the stored token, without involving the
 * user. Tries the token-only refresh_token() first (works for every login
 * method); if that fails - e.g. the token is past refresh_ttl, or this
 * extension is talking to a FullSort.Dev deploy that predates the
 * /api/auth/refresh endpoint - falls back to signing back in with cached
 * email/password credentials, same as before refresh_token() existed.
 *
 * This is the same fallback the 're-auth' message handler below uses when
 * validate_token() finds the token expired; it's pulled out here so
 * authenticated_fetch() can reuse it to recover mid-session (see
 * authenticated_fetch's doc comment).
 *
 * For social-login accounts user_info has no email/pass (see
 * social_sign_in above), so if refresh_token() fails, sign_in() resolves
 * 'fail' here too and callers fall back to their normal "invalid token"
 * handling - those users need to reconnect via sign-in.html only once
 * their token is past refresh_ttl.
 *
 * @returns {Promise<String>} 'success' or 'fail'
 */
function silent_reauth() {
    return refresh_token()
        .then(result => {
            if (result === 'success') {
                return 'success';
            }

            return get_stored_credentials('user_info')
                .then(user_info => sign_in(user_info));
        })
        .catch(err => {
            console.log(err);
            return 'fail';
        });
}

/**
 * Perform a Bearer-token fetch against a Full Sort API endpoint, attaching
 * the stored token and transparently retrying once - after a silent
 * re-auth - if the response comes back 401 (expired/invalid token).
 *
 * This is what keeps a signed-in session alive past the API's token TTL
 * (15 minutes as of this writing, see FullSort.Dev's config/jwt.php)
 * without the user re-entering credentials. Popup-open already re-checks
 * the token via the 're-auth' message handler, but a token can also expire
 * *during* an open popup - e.g. mid-search, or between loading buckets and
 * submitting a bookmark - since nothing was re-validating it in between;
 * this covers that case too, for every authenticated call.
 *
 * @param {String} url
 * @param {Object} [options] fetch() options; any Authorization header is overwritten
 * @returns {Promise<Response>}
 */
function authenticated_fetch(url, options) {
    options = options || {};

    function do_fetch() {
        return chrome.storage.local.get('token')
            .then(res => fetch(url, Object.assign({}, options, {
                headers: Object.assign({}, options.headers, {
                    'Authorization': 'Bearer ' + res.token
                })
            })));
    }

    return do_fetch()
        .then(res => {
            if (res.status !== 401) {
                return res;
            }

            return silent_reauth()
                .then(result => result === 'success' ? do_fetch() : res);
        });
}


/**
 * Get buckets for authenticated user
 *
 * @returns {Promise}
 */
function get_buckets() {
    return authenticated_fetch('https://app.fullsort.com/api/buckets', {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    })
    .then(res => {
        return new Promise(resolve => {
            if (res.status !== 200) {
                resolve([]);
                return;
            }

            res.json()
                .then(res => {
                    resolve(res);
                })
                .catch(err => {
                    console.log(err);
                    resolve([]);
                });
        });
    })
    .catch(err => {
        console.log(err);
        return [];
    });
}


/**
 * Quick-search the user's buckets and links, for the popup's typeahead
 * search box (mirrors the "global search" in the header of app.fullsort.com,
 * see resources/views/layouts/app.blade.php's fullsortSearch()).
 *
 *      IMPORTANT - backend dependency: as of this writing, the FullSort.Dev
 *      codebase only exposes matching search under the session-authenticated
 *      web route GET /search (HomeController@search), not under the
 *      Bearer-token /api/* routes this extension otherwise talks to. This
 *      calls a GET /api/search?search=%QUERY endpoint that does not exist
 *      yet and needs to be added server-side (mirroring HomeController@search,
 *      registered under the existing auth:api route group in routes/api.php)
 *      before this feature will return real results. Until then this will
 *      always resolve to an empty result set.
 *
 * @param {String} query
 * @returns {Promise} resolves { buckets: [], links: [] }
 */
function quick_search(query) {
    const empty = { buckets: [], links: [] };

    if (!query) {
        return new Promise(resolve => resolve(empty));
    }

    return authenticated_fetch('https://app.fullsort.com/api/search?search=' + encodeURIComponent(query), {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    })
    .then(res => {
        return new Promise(resolve => {
            if (res.status !== 200) {
                resolve(empty);
                return;
            }

            res.json()
                .then(res => {
                    resolve({
                        buckets: res.buckets || [],
                        links: res.links || []
                    });
                })
                .catch(err => {
                    console.log(err);
                    resolve(empty);
                });
        });
    })
    .catch(err => {
        console.log(err);
        return empty;
    });
}


/**
 * Send api request to bookmark url
 *
 * @param {type} info
 * @returns {Promise}
 */
function bookmark_url(info) {
    const formData = new FormData();

    if (info === undefined || !info.hasOwnProperty('name') || !info.hasOwnProperty('url')) {
        return new Promise(resolve => {
            resolve(connection_error('Missing bookmark name or URL.'));
        });
    }

    formData.append('bucket', info.bucket);
    formData.append('name', info.name);
    formData.append('url', info.url);
    formData.append('description', info.description);
    formData.append('is_favorite', info.is_favorite === 'Y' ? 'Y' : 'N');

    return authenticated_fetch('https://app.fullsort.com/api/link', {
        method: 'POST',
        body: formData,
        headers: {
            'Accept': 'application/json'
        }
    })
    .then(res => {
        return new Promise(resolve => {
            res.json()
                .then(res => {
                    resolve(res);
                })
                .catch(err => {
                    console.log(err);
                    resolve(connection_error());
                });
        });
    })
    .catch(err => {
        console.log(err);
        return connection_error();
    });
}


/**
 * Send api request to create new bucket
 *
 * @param {type} info
 * @returns {Promise}
 */
function save_bucket(info) {
    const formData = new FormData();

    if (info === undefined || !info.hasOwnProperty('name')) {
        return new Promise(resolve => {
            resolve(connection_error('Missing bucket name.'));
        });
    }

    formData.append('name', info.name);
    formData.append('description', info.description);

    return authenticated_fetch('https://app.fullsort.com/api/bucket', {
        method: 'POST',
        body: formData,
        headers: {
            'Accept': 'application/json'
        }
    })
    .then(res => {
        return new Promise(resolve => {
            res.json()
                .then(res => {
                    resolve(res);
                })
                .catch(err => {
                    console.log(err);
                    resolve(connection_error());
                });
        });
    })
    .catch(err => {
        console.log(err);
        return connection_error();
    });
}


/**
 * Create listener to respond to messages from popup scripts
 *
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === 'login') {
        // Login using provided credentials
        sign_in(request.payload)
            .then(res => sendResponse(res))
            .catch(err => { console.log(err); sendResponse('fail'); });
    } else if (request.message === 'social-login') {
        // Login using a third-party provider (Google or Facebook)
        social_sign_in(request.payload && request.payload.provider)
            .then(res => sendResponse(res))
            .catch(err => { console.log(err); sendResponse('fail'); });
    } else if (request.message === 're-auth') {
        // Validate stored token, silently re-authenticating with cached
        // credentials if it's expired (see silent_reauth above)
        validate_token()
            .then(res => {
                if (res === 'invalid') {
                    silent_reauth()
                        .then(result => sendResponse(result))
                        .catch(err => { console.log(err); sendResponse('fail'); });
                } else {
                    sendResponse('success');
                }
            })
            .catch(err => { console.log(err); sendResponse('fail'); });
    } else if (request.message === 'validate') {
        // Validate user token
        validate_token()
            .then(res => sendResponse(res))
            .catch(err => { console.log(err); sendResponse('invalid'); });
    } else if (request.message === 'logout') {
        // Logout and remove token
        logout()
            .then(res => sendResponse(res))
            .catch(err => { console.log(err); sendResponse('fail'); });
    } else if (request.message === 'get-buckets') {
        // Get list of available buckets
        get_buckets()
            .then(res => sendResponse(res))
            .catch(err => { console.log(err); sendResponse([]); });
    } else if (request.message === 'search') {
        // Quick-search buckets and links for the typeahead search box
        quick_search(request.payload && request.payload.search)
            .then(res => sendResponse(res))
            .catch(err => { console.log(err); sendResponse({ buckets: [], links: [] }); });
    } else if (request.message === 'bookmark') {
        // Save bookmark
        bookmark_url(request.payload)
            .then(res => sendResponse(res))
            .catch(err => { console.log(err); sendResponse(connection_error()); });
    } else if (request.message === 'bucket') {
        // Save bucket
        save_bucket(request.payload)
            .then(res => sendResponse(res))
            .catch(err => { console.log(err); sendResponse(connection_error()); });
    }

    return true;
});
