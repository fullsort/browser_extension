
// Hide the div that displays errors
const errors = document.querySelector('#errors');
errors.style.display = "none";

const submit_button = document.querySelector('button[type="submit"]');

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
                    document.querySelector('#errors').style.display = "block";
                    document.querySelector('#errors').innerHTML = '<span class="danger">Unable to sign in. Check your credentials and your connection, then try again.</span>';
                }
            });
    } else {
        document.querySelector('#email').placeholder = "Enter an email.";
        document.querySelector('#password').placeholder = "Enter a password.";
        document.querySelector('#email').style.backgroundColor = '#FFCC66';
        document.querySelector('#password').style.backgroundColor = '#FFCC66';
    }
});
