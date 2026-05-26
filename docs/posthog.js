/* TWAG analytics + feedback bootstrap.
 *
 * Loads PostHog's web SDK (no bundler), initialises with the project key
 * from window.TWAG_POSTHOG_KEY (set in config.js), and exposes a tiny
 * twagTrack(event, props) helper so the rest of the code can call into
 * analytics without importing PostHog directly.
 *
 * If TWAG_POSTHOG_KEY is missing (e.g. local dev without config.js), the
 * helper becomes a no-op so the rest of the page still works.
 */
(function () {
  if (!window.TWAG_POSTHOG_KEY) return;

  // Official PostHog snippet (minified, from app.posthog.com).
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]);t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init(window.TWAG_POSTHOG_KEY, {
    api_host: "https://us.i.posthog.com",
    person_profiles: "identified_only",  // no per-visitor profiles; anonymous mode
    capture_pageview: true,
    autocapture: true,
    session_recording: {
      // 100% per the plan; revisit if free-tier quota becomes the binding constraint.
      maskAllInputs: true,                // belt-and-suspenders; we don't render any input fields anyway
    },
    // Don't ping during local dev (file://, localhost without explicit opt-in).
    loaded: function (ph) {
      if (location.protocol === "file:") ph.opt_out_capturing();
    },
  });
})();

window.twagTrack = function (event, props) {
  try {
    if (window.posthog && posthog.capture) posthog.capture(event, props || {});
  } catch (_) {}
};
