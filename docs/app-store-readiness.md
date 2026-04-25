# App Store Readiness Checklist

This checklist is a practical guide for getting Mirur closer to App Store submission readiness without changing the current web app functionality.

## Apple Developer Account

- [ ] Create or confirm an active Apple Developer account
- [ ] Enroll the correct individual or organization
- [ ] Confirm bundle identifier and app ownership details
- [ ] Prepare signing, certificates, and App Store Connect access

## Policies And Public URLs

- [ ] Publish a live Privacy Policy URL
  Current route candidate: `/privacy`
- [ ] Publish a live Terms of Use URL
  Current route candidate: `/terms`
- [ ] Publish a live Community Guidelines URL
  Current route candidate: `/community-guidelines`
- [ ] Make sure these URLs are reachable outside local development

## User-Generated Content Moderation

- [ ] Document moderation workflow for user-generated comments
- [ ] Define how reported comments are reviewed
- [ ] Define escalation path for harmful or illegal content
- [ ] Add admin-side moderation tools as a future requirement

## Reporting Abusive Comments

- [x] Users can report comments
- [ ] Confirm production storage and review process for reports
- [ ] Add internal moderation dashboard or manual review workflow

## Deleting Own Comments

- [x] Users can delete their own comments
- [ ] Confirm product copy explains this behavior clearly

## Blocking Users

- [ ] Add user blocking as a future requirement
- [ ] Plan blocked-user behavior for comments, feeds, search, and profile views
- [ ] Plan storage/schema updates for block relationships

## Privacy And Safety

- [ ] Confirm privacy disclosures match actual data collected
- [ ] Confirm safety contact/support process is live
- [ ] Add production abuse escalation guidance

## App Screenshots

- [ ] Prepare iPhone screenshots for App Store Connect
- [ ] Prepare larger-screen screenshots if needed
- [ ] Show core flows:
  Trending, My Feed, Search, Profile, comments, reporting

## App Icon

- [x] Basic Mirur icon exists
- [ ] Produce App Store-ready icon sizes and export set
- [ ] Confirm icon meets Apple branding and resolution requirements

## TestFlight

- [ ] Create an App Store Connect app entry
- [ ] Upload a build for internal testing
- [ ] Validate onboarding, auth, comments, profile upload, and reporting on device
- [ ] Run external beta testing if needed

## Mobile Wrapper Path

- [ ] Use Capacitor as the likely path to ship the current app as mobile
- [ ] Validate the current Next.js app inside a Capacitor wrapper
- [ ] Review auth, storage, navigation, and safe-area behavior on iPhone
- [ ] Add native configuration for icons, splash screens, and permissions

## Final Submission Review

- [ ] Confirm all public links and support contacts are live
- [ ] Confirm moderation and reporting flows work in production
- [ ] Confirm screenshots, icon, metadata, and app description are complete
- [ ] Confirm a TestFlight build has been tested on real devices
