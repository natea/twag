/* TWAG analytics + feedback bootstrap.
 *
 * Loads PostHog's web SDK (no bundler), initialises with the project key
 * from window.TWAG_POSTHOG_KEY (set in config.js), and exposes a tiny
 * twagTrack(event, props) helper so the rest of the code can call into
 * analytics without importing PostHog directly.
 *
 * If TWAG_POSTHOG_KEY is missing (e.g. local dev without config.js), the
 * helper becomes a no-op so the rest of the page still works.
 *
 * Snippet body is PostHog's official recommendation for plain-HTML sites
 * as of 2026-01-30. The `defaults: '2026-01-30'` version pin keeps SDK
 * behavior stable across future PostHog releases — configure session
 * replay / autocapture / surveys from the PostHog dashboard rather than
 * from this file.
 */
(function () {
  if (!window.TWAG_POSTHOG_KEY) return;

  // Official PostHog 2026-01-30 snippet (minified, from app.posthog.com).
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="Mi Ri init Vi Gi Rr Wi Ji Bi capture calculateEventProperties tn register register_once register_for_session unregister unregister_for_session an getFeatureFlag getFeatureFlagPayload getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync un identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset setIdentity clearIdentity get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException addExceptionStep captureLog startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty nn Xi createPersonProfile setInternalOrTestUser sn Hi cn opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing Ki debug Lr rn getPageViewId captureTraceFeedback captureTraceMetric Di".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init(window.TWAG_POSTHOG_KEY, {
    // Managed reverse proxy — events flow z.jazkarta.com → PostHog so
    // ad-blocker lists that block *.posthog.com don't suppress capture.
    api_host: "https://z.jazkarta.com",
    // Needed when api_host is a proxy: lets PostHog-generated links
    // (session replay URLs, etc.) point back to the real PostHog UI.
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    person_profiles: "identified_only",
    // Skip pings during local file:// dev. Localhost via http.server still
    // sends events so you can verify wiring end-to-end.
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
