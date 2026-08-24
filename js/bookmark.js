
// Sentinel value for the "+ New" option in the bucket dropdown
const NEW_BUCKET_VALUE = '__new_bucket__';

// Fallback icon (Font Awesome class string) for a bucket that has none set,
// shared by the bucket dropdown and the quick-search results list below.
const DEFAULT_BUCKET_ICON = 'fab fa-bitbucket';

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
 * Bucket dropdown - a custom icon+name dropdown standing in for a plain
 * <select>, since Chrome doesn't render icons inside native <option>
 * elements. #link_bucket stays in the DOM (hidden) as the source of truth
 * for its value/options, so the rest of this file (and select_search_bucket
 * below) keeps reading/writing it exactly as before; this block is just
 * responsible for keeping the visible trigger + menu in sync with it.
 */
const link_bucket_select = document.querySelector('#link_bucket');
const bucket_select_wrap = document.querySelector('#bucket_select');
const bucket_select_trigger = document.querySelector('#bucket_select_trigger');
const bucket_select_icon = document.querySelector('#bucket_select_icon');
const bucket_select_label = document.querySelector('#bucket_select_label');
const bucket_select_menu = document.querySelector('#bucket_select_menu');
const bucket_select_list = document.querySelector('#bucket_select_list');
const bucket_select_search = document.querySelector('#bucket_select_search');
const bucket_select_empty = document.querySelector('#bucket_select_empty');

/**
 * Build one clickable icon+name row for the bucket dropdown menu
 *
 * @param {String|Number} id
 * @param {String} name
 * @param {String} icon Font Awesome class string, e.g. "fab fa-bitbucket"
 * @returns {HTMLElement}
 */
function build_bucket_row(id, name, icon) {
    const row = document.createElement('div');
    row.className = 'bucket-select-option';
    row.dataset.value = id;
    row.setAttribute('role', 'option');

    const icon_el = document.createElement('i');
    icon_el.className = icon || DEFAULT_BUCKET_ICON;
    row.appendChild(icon_el);

    const label = document.createElement('span');
    label.className = 'bucket-select-name';
    label.textContent = name;
    row.appendChild(label);

    row.addEventListener('click', function() {
        select_bucket(id);
        close_bucket_menu();
    });

    return row;
}

/**
 * Add one bucket as both a hidden <option> (so #link_bucket's value/options
 * keep working the same way they always have) and a visible row in the
 * custom dropdown menu
 *
 * @param {String|Number} id
 * @param {String} name
 * @param {String} icon
 * @returns {undefined}
 */
function add_bucket_option(id, name, icon) {
    const display_name = name.replace(/&nbsp;/g, "\xA0");

    const option = document.createElement('option');
    option.text = display_name;
    option.value = id;
    option.dataset.icon = icon || '';
    link_bucket_select.appendChild(option);

    bucket_select_list.appendChild(build_bucket_row(id, display_name, icon));
}

/**
 * Add the non-interactive divider between "+ New" and the real buckets
 *
 * @returns {undefined}
 */
function add_bucket_divider() {
    const option = document.createElement('option');
    option.textContent = '------------';
    option.value = '';
    option.disabled = true;
    link_bucket_select.appendChild(option);

    const divider = document.createElement('div');
    divider.className = 'bucket-select-divider';
    bucket_select_list.appendChild(divider);
}

/**
 * Add the "+ New" row/option that navigates to bucket.html
 *
 * @returns {undefined}
 */
function add_bucket_new_option() {
    const option = document.createElement('option');
    option.textContent = '+ New';
    option.value = NEW_BUCKET_VALUE;
    link_bucket_select.appendChild(option);

    const row = build_bucket_row(NEW_BUCKET_VALUE, '+ New', 'fa fa-plus');
    row.classList.add('bucket-select-new');
    bucket_select_list.appendChild(row);
}

/**
 * Set #link_bucket's value to the given id, update the visible trigger to
 * match, and fire a 'change' event - setting .value programmatically
 * doesn't do that on its own, and the "+ New" redirect below relies on it.
 *
 * @param {String|Number} id
 * @returns {undefined}
 */
function select_bucket(id) {
    const option = Array.from(link_bucket_select.options).find(function(opt) {
        return opt.value === String(id);
    });

    link_bucket_select.value = id;

    if (option) {
        bucket_select_label.textContent = option.text || '-- Bucket --';
        bucket_select_icon.className = option.dataset.icon || (id === NEW_BUCKET_VALUE ? 'fa fa-plus' : 'fa fa-folder-o');
    }

    bucket_select_list.querySelectorAll('.bucket-select-option').forEach(function(row) {
        row.classList.toggle('active', row.dataset.value === String(id));
    });

    link_bucket_select.dispatchEvent(new Event('change'));
}

/**
 * Show/hide bucket rows in the dropdown to match a search query (matches
 * anywhere in the bucket's name, case-insensitive). The "+ New" row is
 * never filtered out, so it's always reachable even with no matches.
 *
 * @param {String} query
 * @returns {undefined}
 */
function filter_bucket_rows(query) {
    const normalized = query.trim().toLowerCase();
    const rows = Array.from(bucket_select_list.querySelectorAll('.bucket-select-option:not(.bucket-select-new)'));
    let visible_count = 0;

    rows.forEach(function(row) {
        row.classList.remove('kbd-active');

        const name = row.querySelector('.bucket-select-name').textContent.toLowerCase();
        const match = normalized === '' || name.indexOf(normalized) !== -1;
        row.style.display = match ? '' : 'none';

        if (match) {
            visible_count++;
        }
    });

    const no_matches = normalized !== '' && visible_count === 0;
    bucket_select_empty.style.display = no_matches ? '' : 'none';

    const divider = bucket_select_list.querySelector('.bucket-select-divider');
    if (divider) {
        divider.style.display = no_matches ? 'none' : '';
    }
}

/**
 * Open the bucket dropdown menu, reset any previous search, and focus the
 * search box so the user can immediately start typing to filter
 *
 * @returns {undefined}
 */
function open_bucket_menu() {
    bucket_select_menu.classList.add('open');
    bucket_select_trigger.setAttribute('aria-expanded', 'true');
    bucket_select_search.value = '';
    filter_bucket_rows('');
    bucket_select_search.focus();
}

/**
 * Close the bucket dropdown menu
 *
 * @returns {undefined}
 */
function close_bucket_menu() {
    bucket_select_menu.classList.remove('open');
    bucket_select_trigger.setAttribute('aria-expanded', 'false');
}

bucket_select_trigger.addEventListener('click', function() {
    if (bucket_select_menu.classList.contains('open')) {
        close_bucket_menu();
    } else {
        open_bucket_menu();
    }
});

// Opening from the trigger itself only needs to handle "not open yet" -
// once open, focus moves into the search box below, which has its own
// keydown handler for filtering/navigating/selecting.
bucket_select_trigger.addEventListener('keydown', function(ev) {
    if (bucket_select_menu.classList.contains('open')) {
        return;
    }

    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        open_bucket_menu();
    }
});

bucket_select_search.addEventListener('input', function() {
    filter_bucket_rows(bucket_select_search.value);
});

bucket_select_search.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape') {
        close_bucket_menu();
        bucket_select_trigger.focus();
        return;
    }

    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp' && ev.key !== 'Enter') {
        return;
    }

    const rows = Array.from(bucket_select_list.querySelectorAll('.bucket-select-option')).filter(function(row) {
        return row.style.display !== 'none';
    });

    ev.preventDefault();

    if (rows.length === 0) {
        return;
    }

    let index = rows.findIndex(function(row) { return row.classList.contains('kbd-active'); });

    if (ev.key === 'ArrowDown') {
        index = Math.min(index + 1, rows.length - 1);
    } else if (ev.key === 'ArrowUp') {
        index = Math.max(index - 1, 0);
    } else if (ev.key === 'Enter') {
        // With exactly one visible match, Enter picks it even before the
        // user has arrowed down onto it - the common "type and hit enter"
        // flow shouldn't require an extra keypress.
        if (index < 0 && rows.length === 1) {
            index = 0;
        }

        if (index >= 0) {
            rows[index].click();
        }
        return;
    }

    rows.forEach(function(row) {
        row.classList.remove('kbd-active');
    });
    rows[index].classList.add('kbd-active');
    rows[index].scrollIntoView({ block: 'nearest' });
});

document.addEventListener('click', function(ev) {
    if (!bucket_select_wrap.contains(ev.target)) {
        close_bucket_menu();
    }
});

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
                        add_bucket_new_option();
                        add_bucket_divider();

                        for (var i = 0; i < res.length; i++) {
                            add_bucket_option(res[i]['id'], res[i]['name'], res[i]['icon']);
                        }
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
 * selecting a link result opens that link's click-through route in a new tab.
 *
 */
const ICON_URL = 'https://icons.fullsort.com';
const DEFAULT_LINK_ICON_PATH = '_default/transparent_16x16.png';
const SEARCH_MIN_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 250;

// Route that records the click and redirects to the link's real destination
// (see FullSort.Dev's routes/web.php, link.click - Route::get('/link/click/{link}')).
// Using this instead of the link's raw url lets the click be tracked server-side.
const LINK_CLICK_URL_BASE = 'https://app.fullsort.com/link/click';

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
    const option = Array.from(link_bucket_select.options).find(function(opt) {
        return opt.value === String(bucket.id);
    });

    if (!option) {
        // Insert as the first real bucket, i.e. after the "-- Bucket --"
        // placeholder, "+ New", and the divider - not literally first,
        // since "+ New" itself stays pinned as the first selectable entry.
        const new_option = document.createElement('option');
        new_option.value = bucket.id;
        new_option.text = bucket.name;
        new_option.dataset.icon = bucket.icon || '';

        const first_real_option = Array.from(link_bucket_select.options).find(function(opt) {
            return opt.value !== '' && opt.value !== NEW_BUCKET_VALUE;
        });
        link_bucket_select.insertBefore(new_option, first_real_option || null);

        const first_real_row = bucket_select_list.querySelector('.bucket-select-option:not(.bucket-select-new)');
        const new_row = build_bucket_row(bucket.id, bucket.name, bucket.icon);

        if (first_real_row) {
            bucket_select_list.insertBefore(new_row, first_real_row);
        } else {
            bucket_select_list.appendChild(new_row);
        }
    }

    select_bucket(bucket.id);
}

/**
 * Open this link's click-through route (rather than its raw URL) in a new
 * tab, so the click gets recorded server-side before redirecting.
 *
 * @param {Object} link
 * @returns {undefined}
 */
function select_search_link(link) {
    chrome.tabs.create({ url: LINK_CLICK_URL_BASE + '/' + link.id });
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

                // Give the user a clear way back to the main screen instead
                // of leaving them on this confirmation view with a hidden
                // form and no next step.
                const back_button = document.createElement('button');
                back_button.type = 'button';
                back_button.id = 'back_to_bookmark';
                back_button.className = 'btn btn-info btn-sm mt-2';

                const back_icon = document.createElement('i');
                back_icon.className = 'fa fa-arrow-left mr-1';
                back_button.appendChild(back_icon);
                back_button.appendChild(document.createTextNode('Add Another Bookmark'));

                back_button.addEventListener('click', function() {
                    window.location.reload();
                });

                container.appendChild(back_button);
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
