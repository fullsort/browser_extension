
// Hide the div that displays errors
const errors = document.querySelector('#errors');
errors.style.display = "none";

/**
 * Render an errors object (API validation-error shape) into #errors without
 * using innerHTML for any server-controlled content.
 *
 * @param {Object} errors_by_field
 * @returns {undefined}
 */
function render_errors(errors_by_field) {
    const container = document.querySelector('#errors');
    container.textContent = '';

    const span = document.createElement('span');
    span.className = 'danger';

    for (var key in errors_by_field) {
        for (var key1 in errors_by_field[key]) {
            const line = document.createElement('div');
            line.textContent = errors_by_field[key][key1];
            span.appendChild(line);
        }
    }

    container.appendChild(span);
    container.style.display = "block";
}

/**
 * Send a message to the background.js script to validate the token
 */
function authenticate() {
    chrome.runtime.sendMessage({ message: 're-auth',
        payload: {}},
        function (res) {
            if (res !== 'success') {
                window.location.replace('./sign-in.html');
            }
        });
}

authenticate();



/**
 * Add event listener for post of bucket saving
 *
 * @type Element
 */
const add_button = document.querySelector('#add_bucket');

add_button.addEventListener("click", function() {
    const link_name = document.querySelector('#bucket_name').value;
    const bucket_description = document.querySelector('#bucket_description').value;

    add_button.disabled = true;

    // send message to background script to save the url
    chrome.runtime.sendMessage({ message: 'bucket',
        payload: { 'name': link_name, 'description': bucket_description }},
        function (response) {
            if (response.errors === undefined) {
                document.querySelector('#display_description').style.display = "none";
                document.querySelector('#display_name').style.display = "none";
                document.querySelector('#display_bucket').style.display = "none";

                const container = document.querySelector('#errors');
                container.textContent = '';
                const heading = document.createElement('h2');
                heading.className = 'success';
                heading.textContent = 'Bucket Added!';
                container.appendChild(heading);
                container.style.display = "block";

                setTimeout(function(){
                    window.location.replace('./bookmark.html');
                }, 2000);
            } else {
                add_button.disabled = false;
                render_errors(response.errors);
            }
        });

  return true;
});


/**
 * Add event listener for logout
 *
 * @type Element
 */

const logout = document.querySelector('#logout');

logout.addEventListener("click", function() {
    // send message to background script to logout
    chrome.runtime.sendMessage({ message: 'logout',
        payload: {}},
        function (res) {
            window.location.replace('./sign-in.html');
        });

  return true;
});
