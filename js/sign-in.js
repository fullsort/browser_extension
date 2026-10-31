
// Hide the div that displays errors
const errors = document.querySelector('#errors');
errors.style.display = "none";

const submit_button = document.querySelector('button[type="submit"]');
const google_button = document.querySelector('#google_login');
const facebook_button = document.querySelector('#facebook_login');
const code_row = document.querySelector('#code_row');
const code_input = document.querySelector('#code');

/**
 * Show a message in the errors panel
 *
 * @param {String} text
 * @param {String} css_class 'danger' or 'info'
 * @returns {undefined}
 */
function show_message(text, css_class) {
    document.querySelector('#errors').style.display = "block";
    document.querySelector('#errors').innerHTML = '<span class="' + css_class + '">' + text + '</span>';
}

/**
 * Show a generic sign-in failure message in the errors panel
 *
 * @returns {undefined}
 */
function show_sign_in_error() {
    show_message('Unable to sign in. Check your credentials and your connection, then try again.', 'danger');
}

/**
 * Reveal the Extra Security code field and prompt for a code, for an
 * account that has it turned on
 *
 * @returns {undefined}
 */
function show_code_required() {
    code_row.style.display = "";
    code_input.focus();
    show_message('This account has Extra Security turned on. Enter the code from your authenticator app.', 'info');
}

/**
 * Tell the user the Extra Security code they entered was rejected, and let
 * them try again
 *
 * @returns {undefined}
 */
function show_invalid_code() {
    code_row.style.display = "";
    code_input.value = '';
    code_input.focus();
    show_message('That code was not accepted. Please try again.', 'danger');
}

/**
 * Create event listener for onSubmit of sign in form
 *
 * @type type
 */
document.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();

    const email = document.querySelector('#email').value;
    const pass = document.querySelector('#password').value;
    const code = code_input.value;

    if (email && pass) {
        submit_button.disabled = true;

        const payload = { email, pass };
        if (code) {
            payload.code = code;
        }

        // send message to background script with email, password, and
        // (once the account's Extra Security prompt has shown) the code
        chrome.runtime.sendMessage({ message: 'login',
            payload },
            function (response) {
                submit_button.disabled = false;

                if (response === 'success') {
                    window.location.replace('./bookmark.html');
                } else if (response === 'code-required') {
                    show_code_required();
                } else if (response === 'invalid-code') {
                    show_invalid_code();
                } else {
                    show_sign_in_error();
                }
            });
    } else {
        document.querySelector('#email').placeholder = "Enter an email.";
        document.querySelector('#password').placeholder = "Enter a password.";
        document.querySelector('#email').style.backgroundColor = '#FFCC66';
        document.querySelector('#password').style.backgroundColor = '#FFCC66';
    }
});

/**
 * Kick off a third-party (Google/Facebook) sign-in via the background
 * script, which opens Full Sort's existing OAuth flow in a Chrome-managed
 * popup window.
 *
 * @param {String} provider 'google' or 'facebook'
 * @returns {undefined}
 */
function social_login(provider) {
    google_button.disabled = true;
    facebook_button.disabled = true;

    chrome.runtime.sendMessage({ message: 'social-login',
        payload: { provider }},
        function (response) {
            google_button.disabled = false;
            facebook_button.disabled = false;

            if (response === 'success') {
                window.location.replace('./bookmark.html');
            } else {
                show_sign_in_error();
            }
        });
}

google_button.addEventListener('click', () => social_login('google'));
facebook_button.addEventListener('click', () => social_login('facebook'));
