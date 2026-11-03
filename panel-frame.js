// Runs in every x.com frame. Inside the side panel's iframe it marks the page so
// panel-frame.css can drop X's own rail and right column.
if (window !== window.top) document.documentElement.setAttribute("data-xm-panel", "");
