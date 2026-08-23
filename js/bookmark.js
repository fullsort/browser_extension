
// Sentinel value for the "+ New" option in the bucket dropdown
const NEW_BUCKET_VALUE = '__new_bucket__';

// Hide the div that displays errors
const errors = document.querySelector('#errors');
errors.style.display = "none";

/**
 * Render an errors object (API validation-error shape) or a success message
 * into #errors without using innerHTML for any server-controlled content.
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
            } else {
                /**
                 * Call API to get list of BUCKETS
                 */
                chrome.runtime.sendMessage({ message: 'get-buckets',
                    payload: {}},
                    function (res) {
                        var select = document.getElementById("link_bucket");

                        for(var i = 0; i < res.length; i++) {
                            var opt = res[i]['name'];
                            var id = res[i]['id'];
                            var el = document.createElement("option");
                            el.text = opt.replace(/&nbsp;/g, "\xA0");
                            el.value = id;
                            select.appendChild(el);
                        }

                        var el = document.createElement("option");
                        el.textContent = '------------';
                        el.value = '';
                        el.disabled = true;
                        select.appendChild(el);

                        var el = document.createElement("option");
                        el.textContent = '+ New';
                        el.value = NEW_BUCKET_VALUE;
                        select.appendChild(el);

                    });
            }
        });
}

authenticate();


/**
 * Get current browser tab
 *
 * @returns {undefined}
 */
function getTabs() {
    /**
     * Get current browser tab
     */

    // set the current tab as the first item in the tab list
    chrome.tabs.query({currentWindow: true, active: true}, function(tabArray) {
        let tab_url = tabArray[0].url;
        document.getElementById("link_name").value = tabArray[0].title;
        document.getElementById("link_url").value = tab_url;
    });
}

getTabs();


/**
 * Add event listener for on click of COPY button
 *
 * @type Element
 */
const copy_button = document.querySelector('#copy_bookmark');

copy_button.addEventListener("click", function() {
  var copyText = document.getElementById('link_url').value;

  navigator.clipboard.writeText(copyText);
  return true;
});


/**
 * Add event listener for post of bookmark saving
 *
 * @type Element
 */
const add_button = document.querySelector('#add_bookmark');

add_button.addEventListener("click", function() {
    const link_bucket = document.querySelector('#link_bucket').value;
    const link_name = document.querySelector('#link_name').value;
    const link_url = document.querySelector('#link_url').value;
    const link_description = document.querySelector('#link_description').value;
    const link_favorite = document.querySelector('#link_favorite').checked ? 'Y' : 'N';

    add_button.disabled = true;

    // send message to background script to save the url
    chrome.runtime.sendMessage({ message: 'bookmark',
        payload: { 'bucket': link_bucket, 'name': link_name, 'url': link_url, 'description': link_description, 'is_favorite': link_favorite }},
        function (response) {
            add_button.disabled = false;

            if (response.errors === undefined) {
                document.querySelector('#display_description').style.display = "none";
                document.querySelector('#display_bucket').style.display = "none";
                document.querySelector('#display_name').style.display = "none";
                document.querySelector('#display_favorite').style.display = "none";

                const container = document.querySelector('#errors');
                container.textContent = '';
                const heading = document.createElement('h2');
                heading.className = 'success';
                heading.textContent = 'Bookmark Added!';
                container.appendChild(heading);
                container.style.display = "block";
            } else {
                render_errors(response.errors);
            }
        });

  return true;
});

/**
 * Check if user wants to add a new bucket
 *  If so, redirect them to the buckets popup
 *
 * @returns {undefined}
 */
const new_bucket = document.querySelector('#link_bucket');

new_bucket.addEventListener("change", function() {
    const link_bucket = document.querySelector('#link_bucket').value;

    // check if this is a request for a new bucket
    if (link_bucket === NEW_BUCKET_VALUE) {
        window.location.replace('./bucket.html');
    }


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
