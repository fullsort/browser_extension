
// Hide the div that displays errors
const errors = document.querySelector('#errors');
errors.style.display = "none";

const submit_button = document.querySelector('button[type="submit"]');
const google_button = document.querySelector('#google_login');
const facebook_button = document.querySelector('#facebook_login');

/**
 * Show a generic sign-in failure message in the errors panel
 *
 * @returns {undefined}
 */
function show_sign_in_error() {
    document.querySelector('#errors').style.display = "block";
    document.querySelector('#errors').innerHTML = '<span class="danger">Unable to sign in. Check your credentials and your connection, then try again.</span>';
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

    if (email && pass) {
        submit_button.disabled = true;

        // send message to background script with email and password
        chrome.runtime.sendMessage({ message: 'login',
            payload: { email,    pass }},
            function (response) {
                submit_button.disabled = false;

                if (response === 'success') {
                    window.location.replace('./bookmark.html');
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
