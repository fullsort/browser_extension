
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
 * Quick-search typeahead - lets the user search their buckets and links the
 * same way the "global search" in the fullsort.com header does. Selecting a
 * bucket result sets it as the destination bucket for this bookmark;
 * selecting a link result opens that link in a new tab.
 *
 */
const DEFAULT_BUCKET_ICON = 'fab fa-bitbucket';
const ICON_URL = 'https://icons.fullsort.com';
const DEFAULT_LINK_ICON_PATH = '_default/transparent_16x16.png';
const SEARCH_MIN_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 250;

const quick_search_input = document.querySelector('#quick_search');
const search_results = document.querySelector('#search_results');

// The HTML autofocus attribute on #quick_search can be unreliable in a
// Chrome extension popup depending on load timing, so focus it explicitly
// as well when the popup opens.
quick_search_input.focus();

let search_debounce_timer = null;
let search_request_id = 0;
let active_result_index = -1;

/**
 * Hide and clear the search results dropdown
 *
 * @returns {undefined}
 */
function close_search_results() {
    search_results.classList.remove('open');
    search_results.textContent = '';
    active_result_index = -1;
}

/**
 * Pick this bucket as the bookmark's destination bucket
 *
 * @param {Object} bucket
 * @returns {undefined}
 */
function select_search_bucket(bucket) {
    const select = document.querySelector('#link_bucket');

    let option = Array.from(select.options).find(function(opt) {
        return opt.value === String(bucket.id);
    });

    if (!option) {
        option = document.createElement('option');
        option.value = bucket.id;
        option.text = bucket.name;
        select.insertBefore(option, select.firstChild.nextSibling);
    }

    select.value = bucket.id;
}

/**
 * Open this link's URL in a new tab
 *
 * @param {Object} link
 * @returns {undefined}
 */
function select_search_link(link) {
    chrome.tabs.create({ url: link.url });
}

/**
 * Render one row of search results (a header + a list of items)
 *
 * @param {String} label
 * @param {Array} items
 * @param {String} type 'bucket' or 'link'
 * @returns {undefined}
 */
function render_search_group(label, items, type) {
    const heading = document.createElement('div');
    heading.className = 'search-group-label';
    heading.textContent = label;
    search_results.appendChild(heading);

    if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'search-result-empty';
        empty.textContent = 'No matching ' + label.toLowerCase() + '.';
        search_results.appendChild(empty);
        return;
    }

    items.forEach(function(item) {
        const row = document.createElement('div');
        row.className = 'search-result-item';
        row.dataset.searchType = type;

        if (type === 'bucket') {
            const icon = document.createElement('i');
            icon.className = item.icon || DEFAULT_BUCKET_ICON;
            row.appendChild(icon);
        } else {
            const icon = document.createElement('img');
            icon.className = 'search-result-icon';
            icon.src = ICON_URL + '/' + (item.icon || DEFAULT_LINK_ICON_PATH);
            // Fall back to the default transparent icon if the link's own
            // icon fails to load (e.g. a bad/missing key on the icon host)
            icon.addEventListener('error', function on_icon_error() {
                icon.removeEventListener('error', on_icon_error);
                icon.src = ICON_URL + '/' + DEFAULT_LINK_ICON_PATH;
            });
            row.appendChild(icon);
        }

        const name = document.createElement('span');
        name.className = 'search-result-name';
        name.textContent = item.name;
        row.appendChild(name);

        row.addEventListener('click', function() {
            if (type === 'bucket') {
                select_search_bucket(item);
            } else {
                select_search_link(item);
            }

            quick_search_input.value = '';
            close_search_results();
        });

        search_results.appendChild(row);
    });
}

/**
 * Send the search query to the background script and render the results
 *
 * @param {String} query
 * @returns {undefined}
 */
function run_search(query) {
    const this_request = ++search_request_id;

    chrome.runtime.sendMessage({ message: 'search',
        payload: { search: query }},
        function(response) {
            // Ignore stale responses from a previous, superseded request
            if (this_request !== search_request_id) {
                return;
            }

            search_results.textContent = '';
            active_result_index = -1;

            const buckets = (response && response.buckets) || [];
            const links = (response && response.links) || [];

            render_search_group('Buckets', buckets, 'bucket');
            render_search_group('Links', links, 'link');

            search_results.classList.add('open');
        });
}

quick_search_input.addEventListener('input', function() {
    const query = quick_search_input.value.trim();

    clearTimeout(search_debounce_timer);

    if (query.length < SEARCH_MIN_LENGTH) {
        close_search_results();
        return;
    }

    search_debounce_timer = setTimeout(function() {
        run_search(query);
    }, SEARCH_DEBOUNCE_MS);
});

quick_search_input.addEventListener('keydown', function(ev) {
    const items = search_results.querySelectorAll('.search-result-item');

    if (ev.key === 'Escape') {
        close_search_results();
        return;
    }

    if (items.length === 0) {
        return;
    }

    if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        active_result_index = Math.min(active_result_index + 1, items.length - 1);
    } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        active_result_index = Math.max(active_result_index - 1, 0);
    } else if (ev.key === 'Enter') {
        ev.preventDefault();
        if (active_result_index >= 0) {
            items[active_result_index].click();
        }
        return;
    } else {
        return;
    }

    items.forEach(function(item, i) {
        item.classList.toggle('active', i === active_result_index);
    });
});

document.addEventListener('click', function(ev) {
    if (!quick_search_input.contains(ev.target) && !search_results.contains(ev.target)) {
        close_search_results();
    }
});


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
