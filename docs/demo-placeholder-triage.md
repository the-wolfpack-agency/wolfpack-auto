# scan_demo_placeholders — 540 files scanned, 391 findings

## Severity: high=391 medium=0 low=0


### src/lib/inventory-pool.ts  (11 findings)
  [  high] L85    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L114   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L163   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L273   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return [];
  [  high] L325   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L368   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L438   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L565   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L592   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return [];
  [  high] L607   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return [];
  [  high] L622   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return [];

### src/lib/webhook-outbound.ts  (8 findings)
  [  high] L89    demo_constant_block
           const SAMPLE_CONFIGS: WebhookOutboundConfig[] = [
  [  high] L131   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L154   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L183   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L217   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L263   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L292   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return;
  [  high] L324   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/session-replay/route.ts  (7 findings)
  [  high] L10    demo_constant_block
           const DEMO_SESSIONS = [
  [  high] L61    demo_constant_block
           const DEMO_REPLAY_EVENTS = [
  [  high] L86    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L92    returns_demo_payload
           return NextResponse.json({ session, events: DEMO_REPLAY_EVENTS });
  [  high] L94    returns_demo_payload
           return NextResponse.json({ sessions: DEMO_SESSIONS });
  [  high] L137   returns_demo_payload
           return NextResponse.json({ sessions: DEMO_SESSIONS });
  [  high] L162   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/user-testing/route.ts  (7 findings)
  [  high] L11    demo_constant_block
           const DEMO_TESTS: UserTest[] = [
  [  high] L126   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L127   returns_demo_payload
           return NextResponse.json({ tests: DEMO_TESTS });
  [  high] L159   returns_demo_payload
           return NextResponse.json({ tests: DEMO_TESTS });
  [  high] L195   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L265   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L303   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/demo/route.ts  (6 findings)
  [  high] L23    demo_constant_block
           const DEMO_RATE_LIMIT = 5; // max per email per day
  [  high] L24    demo_constant_block
           const DEMO_RATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
  [  high] L48    demo_constant_block
           const SAMPLE_VEHICLES = [
  [  high] L57    demo_constant_block
           const SAMPLE_LEADS = [
  [  high] L111   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L269   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/change-management/route.ts  (6 findings)
  [  high] L35    demo_constant_block
           const MOCK_CHANGES: ChangeRecord[] = [
  [  high] L104   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L105   returns_demo_payload
           return NextResponse.json({ changes: MOCK_CHANGES });
  [  high] L123   returns_demo_payload
           return NextResponse.json({ changes: MOCK_CHANGES }, { status: 200 });
  [  high] L176   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L260   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/good-faith/route.ts  (6 findings)
  [  high] L36    demo_constant_block
           const MOCK_GESTURES: GoodFaithGesture[] = [
  [  high] L75    demo_constant_block
           const MOCK_BUDGET_USED = 1250;
  [  high] L76    demo_constant_block
           const MOCK_BUDGET_TOTAL = 5000;
  [  high] L87    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L199   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L329   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/omnichannel/route.ts  (6 findings)
  [  high] L16    demo_constant_block
           const DEMO_PROFILE = {
  [  high] L45    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L55    returns_demo_payload
           return NextResponse.json({ profile: DEMO_PROFILE });
  [  high] L76    returns_demo_payload
           return NextResponse.json({ profile: DEMO_PROFILE });
  [  high] L117   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L185   returns_demo_payload
           return NextResponse.json({ profile: DEMO_PROFILE });

### src/app/api/admin/dealers/route.ts  (6 findings)
  [  high] L11    demo_constant_block
           const MOCK_DEALERS = [
  [  high] L40    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L41    returns_demo_payload
           return NextResponse.json({ dealers: MOCK_DEALERS });
  [  high] L58    returns_demo_payload
           return NextResponse.json({ dealers: MOCK_DEALERS });
  [  high] L93    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L229   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/lib/cross-dealer-intelligence.ts  (6 findings)
  [  high] L84    demo_constant_block
           const DEMO_REGION = "021";
  [  high] L85    demo_constant_block
           const DEMO_NOW = () => new Date().toISOString();
  [  high] L407   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L428   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L469   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L524   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/lib/deal-copilot.ts  (6 findings)
  [  high] L180   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L215   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return null;
  [  high] L732   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return null;
  [  high] L761   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return null;
  [  high] L793   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L882   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return defaults;

### src/app/api/admin/competitive/route.ts  (5 findings)
  [  high] L35    demo_constant_block
           const MOCK_COMPETITORS: Competitor[] = [
  [  high] L108   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L109   returns_demo_payload
           return NextResponse.json({ competitors: MOCK_COMPETITORS });
  [  high] L136   returns_demo_payload
           return NextResponse.json({ competitors: MOCK_COMPETITORS }, { status: 200 });
  [  high] L186   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/locations/route.ts  (5 findings)
  [  high] L27    demo_constant_block
           const MOCK_LOCATIONS = [
  [  high] L70    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L71    returns_demo_payload
           return NextResponse.json({ locations: MOCK_LOCATIONS });
  [  high] L93    returns_demo_payload
           return NextResponse.json({ locations: MOCK_LOCATIONS });
  [  high] L131   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/surveys/route.ts  (5 findings)
  [  high] L18    demo_constant_block
           const DEMO_DEALER = "00000000-0000-4000-a000-000000000001";
  [  high] L43    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L114   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L194   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L236   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/marketing/route.ts  (5 findings)
  [  high] L30    demo_constant_block
           const MOCK_CAMPAIGNS: Campaign[] = [
  [  high] L86    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L87    returns_demo_payload
           return NextResponse.json({ campaigns: MOCK_CAMPAIGNS });
  [  high] L106   returns_demo_payload
           return NextResponse.json({ campaigns: MOCK_CAMPAIGNS }, { status: 200 });
  [  high] L157   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/agency/api-keys/route.ts  (5 findings)
  [  high] L23    demo_constant_block
           const SAMPLE_KEYS: ApiKey[] = [
  [  high] L57    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L58    returns_demo_payload
           return NextResponse.json({ keys: SAMPLE_KEYS });
  [  high] L71    returns_demo_payload
           return NextResponse.json({ keys: SAMPLE_KEYS });
  [  high] L103   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/lib/prediction-calibrator.ts  (5 findings)
  [  high] L111   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L148   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L214   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return [];
  [  high] L421   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return; // shadow mode — no persistence
  [  high] L475   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/lib/auction-feed.ts  (5 findings)
  [  high] L300   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L397   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return 0;
  [  high] L493   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L584   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L744   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/walkarounds/route.ts  (4 findings)
  [  high] L17    demo_constant_block
           const DEMO_WALKAROUNDS = [
  [  high] L60    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L67    returns_demo_payload
           return NextResponse.json({ walkarounds: DEMO_WALKAROUNDS });
  [  high] L82    returns_demo_payload
           return NextResponse.json({ walkarounds: DEMO_WALKAROUNDS });

### src/app/api/admin/call-intelligence/route.ts  (4 findings)
  [  high] L14    demo_constant_block
           const DEMO_CALLS: CallAnalysis[] = [
  [  high] L20    demo_constant_block
           const DEMO_METRICS = aggregateCallMetrics(DEMO_CALLS);
  [  high] L33    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L68    returns_demo_payload
           return NextResponse.json({ calls: DEMO_CALLS, metrics: DEMO_METRICS });

### src/app/api/admin/equity-mining/route.ts  (4 findings)
  [  high] L15    demo_constant_block
           const DEMO_OPPORTUNITIES = [
  [  high] L127   demo_constant_block
           const DEMO_STATS = {
  [  high] L144   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L271   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/inventory-pool/visible/route.ts  (4 findings)
  [  high] L5     demo_constant_block
           const DEMO_VISIBLE = [
  [  high] L16    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L17    returns_demo_payload
           return NextResponse.json({ inventory: DEMO_VISIBLE });
  [  high] L29    returns_demo_payload
           return NextResponse.json({ inventory: DEMO_VISIBLE });

### src/app/api/admin/inventory-pool/swaps/route.ts  (4 findings)
  [  high] L6     demo_constant_block
           const DEMO_SWAPS = [
  [  high] L29    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L30    returns_demo_payload
           return NextResponse.json({ swaps: DEMO_SWAPS });
  [  high] L38    returns_demo_payload
           if (msg.includes("does not exist")) return NextResponse.json({ swaps: DEMO_SWAPS });

### src/app/api/admin/digital-retail/credit-app/route.ts  (4 findings)
  [  high] L31    demo_constant_block
           const MOCK_APPS: CreditApp[] = [
  [  high] L95    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L96    returns_demo_payload
           return NextResponse.json({ applications: MOCK_APPS });
  [  high] L108   returns_demo_payload
           return NextResponse.json({ applications: MOCK_APPS });

### src/app/api/admin/auction/opportunities/route.ts  (4 findings)
  [  high] L4     demo_constant_block
           const DEMO_OPPORTUNITIES = [
  [  high] L52    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L53    returns_demo_payload
           return NextResponse.json({ opportunities: DEMO_OPPORTUNITIES });
  [  high] L106   returns_demo_payload
           return NextResponse.json({ opportunities: DEMO_OPPORTUNITIES });

### src/app/api/agency/dealers/route.ts  (4 findings)
  [  high] L24    demo_constant_block
           const SAMPLE_DEALERS: DealerSummary[] = [
  [  high] L77    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L78    returns_demo_payload
           return NextResponse.json({ dealers: SAMPLE_DEALERS });
  [  high] L114   returns_demo_payload
           return NextResponse.json({ dealers: SAMPLE_DEALERS });

### src/lib/ab-testing.ts  (4 findings)
  [  high] L185   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return;
  [  high] L361   demo_constant_block
           const MOCK_AB_RESULTS: ABTestResult[] = [
  [  high] L406   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return MOCK_AB_RESULTS;
  [  high] L509   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return { success: true, test };

### src/app/api/admin/domains/route.ts  (3 findings)
  [  high] L59    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L143   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L182   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/rewards/route.ts  (3 findings)
  [  high] L29    demo_constant_block
           const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  [  high] L38    demo_constant_block
           const MOCK_RECENT_AWARDS: RecentAward[] = [
  [  high] L45    demo_constant_block
           const MOCK_TOTAL_POINTS = 2420;

### src/app/api/admin/vehicle-pipeline/route.ts  (3 findings)
  [  high] L16    demo_constant_block
           const DEMO_PIPELINE = {
  [  high] L55    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L79    returns_demo_payload
           return NextResponse.json({ pipeline: DEMO_PIPELINE, slowMovers: [] });

### src/app/api/admin/annotations/route.ts  (3 findings)
  [  high] L16    demo_constant_block
           const DEMO_ANNOTATIONS = [
  [  high] L37    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L71    returns_demo_payload
           return NextResponse.json({ annotations: DEMO_ANNOTATIONS });

### src/app/api/admin/engagement-reports/route.ts  (3 findings)
  [  high] L29    demo_constant_block
           const MOCK_REPORTS: EngagementReport[] = [
  [  high] L92    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L187   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/vehicles/backgrounds/custom/[id]/route.ts  (3 findings)
  [  high] L25    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L95    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L168   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/locations/[locationId]/route.ts  (3 findings)
  [  high] L40    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L128   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L239   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/health/deep/route.ts  (3 findings)
  [  high] L92    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L154   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L272   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/lib/predictive-lead-scorer.ts  (3 findings)
  [  high] L383   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L949   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L1004  shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/lib/webhooks.ts  (3 findings)
  [  high] L43    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return [];
  [  high] L78    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L114   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return;

### src/lib/push-notifications.ts  (3 findings)
  [  high] L165   demo_constant_block
           const MOCK_SUBSCRIPTIONS: PushSubscriptionRecord[] = [
  [  high] L201   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L229   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return;

### src/lib/data-export.ts  (3 findings)
  [  high] L148   demo_constant_block
           const DEMO_DATA: Record<ExportTable, Record<string, unknown>[]> = {
  [  high] L215   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L360   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/lib/lookalike-engine.ts  (3 findings)
  [  high] L42    demo_constant_block
           const MOCK_VEHICLES: Omit<RelatedVehicle, "score" | "reason">[] = [
  [  high] L90    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L202   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/settings/route.ts  (2 findings)
  [  high] L24    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L81    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/syndication/route.ts  (2 findings)
  [  high] L16    demo_constant_block
           const MOCK_FEEDS = [
  [  high] L99    demo_constant_block
           const MOCK_SYNC_HISTORY = [

### src/app/api/admin/propensity/route.ts  (2 findings)
  [  high] L18    demo_constant_block
           const DEMO_CUSTOMERS = [
  [  high] L37    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/sms/route.ts  (2 findings)
  [  high] L23    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L110   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/lenders/route.ts  (2 findings)
  [  high] L11    demo_constant_block
           const MOCK_LENDERS = [
  [  high] L153   returns_demo_payload
           return NextResponse.json({ lenders: MOCK_LENDERS });

### src/app/api/admin/resources/route.ts  (2 findings)
  [  high] L33    demo_constant_block
           const SAMPLE_RESOURCES: Resource[] = [
  [  high] L140   returns_demo_payload
           return NextResponse.json({ resources: SAMPLE_RESOURCES });

### src/app/api/admin/reinsurance/route.ts  (2 findings)
  [  high] L102   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L219   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/compliance/route.ts  (2 findings)
  [  high] L42    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L127   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/drip-campaigns/route.ts  (2 findings)
  [  high] L16    demo_constant_block
           const DEMO_CAMPAIGNS = [
  [  high] L70    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/bulk-provision/route.ts  (2 findings)
  [  high] L60    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L140   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/households/route.ts  (2 findings)
  [  high] L20    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L125   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/reset-password/route.ts  (2 findings)
  [  high] L30    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L140   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/error-monitor/route.ts  (2 findings)
  [  high] L16    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L106   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/pricing/route.ts  (2 findings)
  [  high] L22    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L126   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/dealer-users/route.ts  (2 findings)
  [  high] L51    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L103   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/lead-ingestion/route.ts  (2 findings)
  [  high] L16    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L119   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/dealer-users/[id]/route.ts  (2 findings)
  [  high] L33    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L102   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/reviews/templates/route.ts  (2 findings)
  [  high] L21    demo_constant_block
           const MOCK_TEMPLATES: ResponseTemplate[] = [
  [  high] L67    returns_demo_payload
           return NextResponse.json({ templates: MOCK_TEMPLATES });

### src/app/api/admin/analytics/verification/route.ts  (2 findings)
  [  high] L223   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L266   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/econtracting/[contractId]/route.ts  (2 findings)
  [  high] L28    demo_constant_block
           const MOCK_CONTRACT = {
  [  high] L91    returns_demo_payload
           return NextResponse.json({ contract: { ...MOCK_CONTRACT, id: contractId, ...overrides } });

### src/app/api/admin/service/technicians/route.ts  (2 findings)
  [  high] L28    demo_constant_block
           const MOCK_TECHNICIANS: Technician[] = [
  [  high] L116   returns_demo_payload
           return NextResponse.json({ technicians: MOCK_TECHNICIANS });

### src/app/api/admin/export/leads/route.ts  (2 findings)
  [  high] L47    demo_constant_block
           const SAMPLE_LEADS: Lead[] = [
  [  high] L209   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/documents/analyze/route.ts  (2 findings)
  [  high] L23    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L39    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/vehicles/[vin]/route.ts  (2 findings)
  [  high] L31    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L91    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/inventory/[vin]/route.ts  (2 findings)
  [  high] L23    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L119   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/knowledge/ingest/route.ts  (2 findings)
  [  high] L22    demo_constant_block
           const MOCK_INGESTED = [
  [  high] L128   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/knowledge/query/route.ts  (2 findings)
  [  high] L27    demo_constant_block
           const MOCK_KNOWLEDGE_BASE: KnowledgeResult[] = [
  [  high] L145   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/deals/[dealId]/route.ts  (2 findings)
  [  high] L14    demo_constant_block
           const MOCK_DEAL = {
  [  high] L130   returns_demo_payload
           return NextResponse.json({ deal: { ...MOCK_DEAL, id: dealId, ...overrides } });

### src/app/api/admin/comms/sequences/route.ts  (2 findings)
  [  high] L33    demo_constant_block
           const MOCK_SEQUENCES: FollowUpSequence[] = [
  [  high] L115   returns_demo_payload
           return NextResponse.json({ sequences: MOCK_SEQUENCES });

### src/app/api/admin/lender-routing/[submissionId]/route.ts  (2 findings)
  [  high] L13    demo_constant_block
           const MOCK_SUBMISSION = {
  [  high] L88    returns_demo_payload
           return NextResponse.json({ submission: MOCK_SUBMISSION });

### src/app/api/admin/security/scan/route.ts  (2 findings)
  [  high] L13    demo_constant_block
           const MOCK_SCAN_RESULT = {
  [  high] L180   returns_demo_payload
           return NextResponse.json({ scan: MOCK_SCAN_RESULT });

### src/app/api/admin/settings/integrations/route.ts  (2 findings)
  [  high] L36    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L92    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/settings/logo/route.ts  (2 findings)
  [  high] L24    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L82    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/settings/notifications/route.ts  (2 findings)
  [  high] L33    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L67    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/customers/[id]/route.ts  (2 findings)
  [  high] L76    demo_constant_block
           const MOCK_CUSTOMER: Customer360 = {
  [  high] L279   returns_demo_payload
           return NextResponse.json({ customer: { ...MOCK_CUSTOMER, id } });

### src/lib/privacy.ts  (2 findings)
  [  high] L59    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L133   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/lib/notifications.ts  (2 findings)
  [  high] L52    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return [];
  [  high] L75    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return "Our Dealership";

### src/lib/household.ts  (2 findings)
  [  high] L307   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L328   demo_constant_block
           export const DEMO_HOUSEHOLDS: Household[] = [

### src/lib/pricing-engine.ts  (2 findings)
  [  high] L1192  demo_constant_block
           const DEMO_INVENTORY: (InventoryVehicle & { days_on_lot: number })[] = [
  [  high] L1259  demo_constant_block
           const DEMO_SIGNALS: Record<string, Partial<VehicleSignals>> = {

### src/lib/onboarding-analytics.ts  (2 findings)
  [  high] L61    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return;
  [  high] L261   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return emptyFunnel;

### src/lib/delivery-scheduling.ts  (2 findings)
  [  high] L150   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {
  [  high] L262   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/leads/route.ts  (1 finding)
  [  high] L111   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/analytics/events/route.ts  (1 finding)
  [  high] L74    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/cron/auction-sync/route.ts  (1 finding)
  [  high] L28    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/cron/predict-leads/route.ts  (1 finding)
  [  high] L36    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/cron/calibrate-predictions/route.ts  (1 finding)
  [  high] L35    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/service/delivery/route.ts  (1 finding)
  [  high] L19    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/vehicle-provenance/[vin]/verify/route.ts  (1 finding)
  [  high] L54    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/surveys/respond/route.ts  (1 finding)
  [  high] L42    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/inventory/spotlight/route.ts  (1 finding)
  [  high] L19    demo_constant_block
           const SAMPLE_VEHICLES = [

### src/app/api/inventory/feed/route.ts  (1 finding)
  [  high] L124   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/customers/route.ts  (1 finding)
  [  high] L25    demo_constant_block
           const MOCK_CUSTOMERS: CustomerListItem[] = [

### src/app/api/admin/vehicle-history/route.ts  (1 finding)
  [  high] L25    demo_constant_block
           const MOCK_REPORTS = [

### src/app/api/admin/maintenance-leads/route.ts  (1 finding)
  [  high] L64    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/data-export/route.ts  (1 finding)
  [  high] L33    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/tasks/route.ts  (1 finding)
  [  high] L28    demo_constant_block
           const MOCK_TASKS: Task[] = [

### src/app/api/admin/trade-in/route.ts  (1 finding)
  [  high] L28    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/ofac/route.ts  (1 finding)
  [  high] L16    demo_constant_block
           const MOCK_SCREENINGS = [

### src/app/api/admin/lender-routing/route.ts  (1 finding)
  [  high] L15    demo_constant_block
           const MOCK_SUBMISSIONS = [

### src/app/api/admin/vin-decode/route.ts  (1 finding)
  [  high] L64    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/leads/route.ts  (1 finding)
  [  high] L23    demo_constant_block
           const SAMPLE_LEADS: Lead[] = [

### src/app/api/admin/training/route.ts  (1 finding)
  [  high] L28    demo_constant_block
           const SAMPLE_CERTIFICATIONS: Certification[] = [

### src/app/api/admin/reputation/route.ts  (1 finding)
  [  high] L24    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/comms/route.ts  (1 finding)
  [  high] L26    demo_constant_block
           const MOCK_ANNOUNCEMENTS: Announcement[] = [

### src/app/api/admin/fi-products/route.ts  (1 finding)
  [  high] L13    demo_constant_block
           const MOCK_FI_PRODUCTS = [

### src/app/api/admin/deals/route.ts  (1 finding)
  [  high] L15    demo_constant_block
           const MOCK_DEALS = [

### src/app/api/admin/intake/route.ts  (1 finding)
  [  high] L30    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/alerts/route.ts  (1 finding)
  [  high] L20    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/quick-add/route.ts  (1 finding)
  [  high] L130   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/connected-vehicles/route.ts  (1 finding)
  [  high] L17    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/erating/route.ts  (1 finding)
  [  high] L23    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/inventory/route.ts  (1 finding)
  [  high] L20    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/vehicles/route.ts  (1 finding)
  [  high] L179   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/funnel-health/route.ts  (1 finding)
  [  high] L18    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/accept-invite/route.ts  (1 finding)
  [  high] L34    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/documents/route.ts  (1 finding)
  [  high] L10    demo_constant_block
           const MOCK_DOCUMENTS = [

### src/app/api/admin/heatmaps/route.ts  (1 finding)
  [  high] L247   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/econtracting/route.ts  (1 finding)
  [  high] L59    demo_constant_block
           const MOCK_CONTRACTS: Contract[] = [

### src/app/api/admin/floor-plan/route.ts  (1 finding)
  [  high] L16    demo_constant_block
           const MOCK_LINES = [

### src/app/api/admin/stats/route.ts  (1 finding)
  [  high] L19    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/billing/route.ts  (1 finding)
  [  high] L11    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/onboarding/route.ts  (1 finding)
  [  high] L320   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/reviews/route.ts  (1 finding)
  [  high] L27    demo_constant_block
           const MOCK_REVIEWS: Review[] = [

### src/app/api/admin/deliveries/route.ts  (1 finding)
  [  high] L11    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/desking/scenarios/route.ts  (1 finding)
  [  high] L10    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/analytics/micro-signals/route.ts  (1 finding)
  [  high] L48    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/analytics/intelligence/route.ts  (1 finding)
  [  high] L120   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return;

### src/app/api/admin/analytics/calibration/route.ts  (1 finding)
  [  high] L17    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/analytics/subdashboards/route.ts  (1 finding)
  [  high] L203   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/analytics/learning/route.ts  (1 finding)
  [  high] L15    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/analytics/health/route.ts  (1 finding)
  [  high] L21    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/analytics/ab-tests/route.ts  (1 finding)
  [  high] L14    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/analytics/platform-health/route.ts  (1 finding)
  [  high] L168   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/analytics/cohorts/route.ts  (1 finding)
  [  high] L19    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/analytics/query/route.ts  (1 finding)
  [  high] L17    demo_constant_block
           const SAMPLE_DATA = {

### src/app/api/admin/dealers/[id]/route.ts  (1 finding)
  [  high] L13    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/onboarding/status/route.ts  (1 finding)
  [  high] L43    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/notifications/push/route.ts  (1 finding)
  [  high] L17    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/pricing/optimize/route.ts  (1 finding)
  [  high] L50    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/pricing/lot-report/route.ts  (1 finding)
  [  high] L25    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/pricing/recommendations/route.ts  (1 finding)
  [  high] L28    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/pricing/[vehicleId]/route.ts  (1 finding)
  [  high] L47    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/econtracting/sign/route.ts  (1 finding)
  [  high] L41    demo_constant_block
           const MOCK_CONTRACTS: MockContract[] = [

### src/app/api/admin/service/appointments/route.ts  (1 finding)
  [  high] L38    demo_constant_block
           const MOCK_APPOINTMENTS: ServiceAppointment[] = [

### src/app/api/admin/service/repair-orders/route.ts  (1 finding)
  [  high] L53    demo_constant_block
           const MOCK_ROS: RepairOrder[] = [

### src/app/api/admin/service/parts/route.ts  (1 finding)
  [  high] L29    demo_constant_block
           const MOCK_PARTS: Part[] = [

### src/app/api/admin/service/history/[vin]/route.ts  (1 finding)
  [  high] L28    demo_constant_block
           const MOCK_HISTORY: Record<string, ServiceHistoryRecord[]> = {

### src/app/api/admin/export/analytics/route.ts  (1 finding)
  [  high] L16    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/vehicle-provenance/record/route.ts  (1 finding)
  [  high] L67    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/vehicle-provenance/[vin]/route.ts  (1 finding)
  [  high] L27    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/vehicle-provenance/anchor/route.ts  (1 finding)
  [  high] L37    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/documents/scan-all/route.ts  (1 finding)
  [  high] L116   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/vehicles/index-all/route.ts  (1 finding)
  [  high] L20    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/vehicles/generate-listing/route.ts  (1 finding)
  [  high] L259   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/vehicles/backgrounds/recommend/route.ts  (1 finding)
  [  high] L19    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/vehicles/backgrounds/system/[id]/route.ts  (1 finding)
  [  high] L30    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/vehicles/[vin]/buyers-guide/route.ts  (1 finding)
  [  high] L36    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/marketing/templates/route.ts  (1 finding)
  [  high] L18    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/marketing/templates/performance/route.ts  (1 finding)
  [  high] L15    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/marketing/templates/[id]/route.ts  (1 finding)
  [  high] L19    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/marketing/templates/[id]/canva/route.ts  (1 finding)
  [  high] L18    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/surveys/[surveyId]/responses/route.ts  (1 finding)
  [  high] L20    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/inventory/import/route.ts  (1 finding)
  [  high] L340   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/connected-vehicles/connect/route.ts  (1 finding)
  [  high] L40    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/intake/recommendations/route.ts  (1 finding)
  [  high] L21    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/compliance/checks/route.ts  (1 finding)
  [  high] L11    demo_constant_block
           const MOCK_CHECKS = [

### src/app/api/admin/mfa/enable/route.ts  (1 finding)
  [  high] L27    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/mfa/disable/route.ts  (1 finding)
  [  high] L25    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/mfa/verify/route.ts  (1 finding)
  [  high] L27    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/mfa/setup/route.ts  (1 finding)
  [  high] L24    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/mfa/status/route.ts  (1 finding)
  [  high] L19    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/deals/[dealId]/calculate/route.ts  (1 finding)
  [  high] L188   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/deals/[dealId]/submit/route.ts  (1 finding)
  [  high] L9     demo_constant_block
           const MOCK_LENDER_NAMES: Record<string, string> = {

### src/app/api/admin/comms/templates/route.ts  (1 finding)
  [  high] L26    demo_constant_block
           const MOCK_TEMPLATES: MessageTemplate[] = [

### src/app/api/admin/comms/log/route.ts  (1 finding)
  [  high] L28    demo_constant_block
           const MOCK_LOG: MessageLogEntry[] = [

### src/app/api/admin/leads/score-all/route.ts  (1 finding)
  [  high] L18    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/leads/[id]/route.ts  (1 finding)
  [  high] L298   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/digital-retail/calculator/route.ts  (1 finding)
  [  high] L20    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/lender-routing/lenders/route.ts  (1 finding)
  [  high] L11    demo_constant_block
           const MOCK_LENDERS = [

### src/app/api/admin/ofac/[screeningId]/route.ts  (1 finding)
  [  high] L13    demo_constant_block
           const MOCK_SCREENING_DETAIL: Record<string, Record<string, unknown>> = {

### src/app/api/admin/auction/benchmarks/route.ts  (1 finding)
  [  high] L23    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/maintenance-leads/[id]/complete/route.ts  (1 finding)
  [  high] L37    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/maintenance-leads/[id]/dismiss/route.ts  (1 finding)
  [  high] L37    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/syndication/export/route.ts  (1 finding)
  [  high] L16    demo_constant_block
           const MOCK_INVENTORY = [

### src/app/api/admin/accounting/sales-log/route.ts  (1 finding)
  [  high] L36    demo_constant_block
           const MOCK_SALES: SaleEntry[] = [

### src/app/api/admin/accounting/commissions/route.ts  (1 finding)
  [  high] L28    demo_constant_block
           const MOCK_COMMISSIONS: CommissionEntry[] = [

### src/app/api/admin/accounting/chart/route.ts  (1 finding)
  [  high] L50    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/admin/accounting/export/route.ts  (1 finding)
  [  high] L9     demo_constant_block
           const MOCK_TRANSACTIONS = [

### src/app/api/admin/vehicle-history/[vin]/route.ts  (1 finding)
  [  high] L18    demo_constant_block
           const MOCK_REPORTS: Record<string, {

### src/app/api/agency/overview/route.ts  (1 finding)
  [  high] L34    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/trade-in/submit/route.ts  (1 finding)
  [  high] L66    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/api/demo/convert/route.ts  (1 finding)
  [  high] L85    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/app/admin/documents/compliance/page.tsx  (1 finding)
  [  high] L82    demo_constant_block
           const MOCK_RECENT: AnalysisResult[] = [

### src/app/admin/inventory/backgrounds/page.tsx  (1 finding)
  [  high] L99    demo_constant_block
           const DEMO_VEHICLES: VehicleCard[] = [

### src/lib/analytics-engine.ts  (1 finding)
  [  high] L145   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/lib/comms-scheduler.ts  (1 finding)
  [  high] L81    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/lib/learning-aggregator.ts  (1 finding)
  [  high] L103   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return null;

### src/lib/triple-write.ts  (1 finding)
  [  high] L188   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return false;

### src/lib/get-dealer-id.ts  (1 finding)
  [  high] L10    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return "demo-dealer";

### src/lib/audit-log.ts  (1 finding)
  [  high] L57    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return;

### src/lib/analytics-hooks.ts  (1 finding)
  [  high] L25    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return; // shadow mode — skip DB write

### src/lib/funnel-health.ts  (1 finding)
  [  high] L258   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/lib/heatmap.ts  (1 finding)
  [  high] L277   shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/lib/dataflow-health.ts  (1 finding)
  [  high] L16    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) {

### src/lib/intake/vehicle-indexer.ts  (1 finding)
  [  high] L72    shadow_mode_branch_no_db
           if (!process.env.DATABASE_URL) return null;
