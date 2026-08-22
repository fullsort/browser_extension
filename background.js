
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
 * available on fullsort.com).
 *
 *      Opens a Chrome-managed web auth flow pointed at the Full Sort OAuth
 *      kickoff endpoint for the given provider, passing along the
 *      extension's chromiumapp.org redirect URI. Full Sort completes the
 *      provider handshake on its own servers and redirects back to that URI
 *      with a `token` query param on success. On success, store the token
 *      in chrome local storage the same way sign_in() does.
 *
 *      Note: unlike email/password sign-in, the resulting user_info has no
 *      `email`/`pass` fields, so re-auth cannot silently refresh an expired
 *      social-login session in the background - the user is instead sent
 *      back to sign-in.html to reconnect, same as any other invalid token.
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
    const auth_url = 'https://app.fullsort.com/api/auth/' + provider +
        '/redirect?redirect_uri=' + encodeURIComponent(redirect_uri);

    return new Promise(resolve => {
        chrome.identity.launchWebAuthFlow(
            { url: auth_url, interactive: true },
            function(response_url) {
                if (chrome.runtime.lastError || !response_url) {
                    resolve('fail');
                    return;
                }

                let token;
                try {
                    token = new URL(response_url).searchParams.get('token');
                } catch (err) {
                    console.log(err);
                    resolve('fail');
                    return;
                }

                if (!token) {
                    resolve('fail');
                    return;
                }

                chrome.storage.local.set({ 'user_info': { provider: provider }, 'token': token }, function () {
                    if (chrome.runtime.lastError) {
                        resolve('fail');
                        return;
                    }
                    resolve('success');
                });
            }
        );
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
 * Get buckets for authenticated user
 *
 * @returns {Promise}
 */
function get_buckets() {
    return chrome.storage.local.get('token')
        .then(res => {
            return fetch('https://app.fullsort.com/api/buckets', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + res.token
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

    return chrome.storage.local.get('token')
        .then(res => {
            return fetch('https://app.fullsort.com/api/link', {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + res.token
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

    return chrome.storage.local.get('token')
        .then(res => {
            return fetch('https://app.fullsort.com/api/bucket', {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + res.token
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
        // Validate stored token
        validate_token()
            .then(res => {
                if (res === 'invalid') {
                    // Get stored credentials
                    get_stored_credentials('user_info')
                        .then(res => {
                            // Login using stored credentials
                            sign_in(res)
                                .then(result => sendResponse(result))
                                .catch(err => { console.log(err); sendResponse('fail'); });
                        })
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
