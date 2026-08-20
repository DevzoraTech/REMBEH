# REMBEH Mobile Offline-First Sync Architecture

## Problem Statement

Field agents work in rural areas with unreliable or no internet connectivity. They need to:
- Capture loan applications with photos and signatures
- Record collections and payments
- View customer history and loan details
- Open and close their agent day
- Work with real, up-to-date data even when offline for hours or days

## Solution: Smart Offline-First Architecture

### Core Principles

1. **Local-First**: All reads and writes happen against local SQLite database
2. **Optimistic Updates**: Agent works normally, changes queued for sync
3. **Atomic Sync**: Download full snapshot → merge pending changes → upload queue → atomic swap
4. **Server is Truth**: On conflicts, server data wins (but preserve local record)
5. **Minimal Bandwidth**: Only sync what changed, compress media
6. **Graceful Degradation**: App works fully offline after initial sync

---

## Architecture Components

### 1. Local Storage Layer

**SQLite Database Schema** (`rembeh_local.db`)

Tables mirror server Prisma schema, scoped to agent's `tenantId` + `branchId`:

```sql
-- Core tables (read-only after sync)
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  nin TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  village TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE loans (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  loan_product_id TEXT NOT NULL,
  principal REAL NOT NULL,
  interest_rate REAL NOT NULL,
  term_months INTEGER NOT NULL,
  status TEXT NOT NULL, -- ACTIVE, COMPLETED, DEFAULTED
  disbursed_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE loan_products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  min_amount REAL NOT NULL,
  max_amount REAL NOT NULL,
  interest_rate REAL NOT NULL,
  min_term INTEGER NOT NULL,
  max_term INTEGER NOT NULL,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL
);

CREATE TABLE branches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT
);

-- Operational tables (agents modify these)
CREATE TABLE loan_applications (
  id TEXT PRIMARY KEY,           -- Server-generated after upload
  local_id TEXT UNIQUE NOT NULL, -- Client-generated UUID for offline tracking
  tenant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  customer_id TEXT,              -- NULL if new customer
  status TEXT NOT NULL,          -- DRAFT, SUBMITTED, SYNCED
  applicant_nin TEXT,
  applicant_first_name TEXT NOT NULL,
  applicant_last_name TEXT NOT NULL,
  applicant_phone TEXT NOT NULL,
  requested_amount REAL NOT NULL,
  loan_product_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  submitted_at INTEGER,
  synced_at INTEGER,
  FOREIGN KEY (loan_product_id) REFERENCES loan_products(id)
);

CREATE TABLE loan_application_media (
  id TEXT PRIMARY KEY,
  local_id TEXT UNIQUE NOT NULL,
  loan_application_id TEXT,      -- NULL until loan_application synced
  loan_application_local_id TEXT NOT NULL,
  media_type TEXT NOT NULL,      -- NATIONAL_ID, PASSPORT_PHOTO, etc.
  local_file_path TEXT NOT NULL, -- Path on device
  s3_key TEXT,                   -- NULL until uploaded
  upload_status TEXT NOT NULL,   -- PENDING, UPLOADING, UPLOADED, FAILED
  created_at INTEGER NOT NULL,
  uploaded_at INTEGER,
  FOREIGN KEY (loan_application_local_id) REFERENCES loan_applications(local_id)
);

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  local_id TEXT UNIQUE NOT NULL,
  tenant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  loan_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  amount REAL NOT NULL,
  collection_date INTEGER NOT NULL,
  receipt_number TEXT,
  status TEXT NOT NULL,          -- PENDING_SYNC, SYNCED
  created_at INTEGER NOT NULL,
  synced_at INTEGER,
  FOREIGN KEY (loan_id) REFERENCES loans(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE agent_days (
  id TEXT PRIMARY KEY,
  local_id TEXT UNIQUE NOT NULL,
  tenant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  opening_float REAL NOT NULL,
  closing_balance REAL,
  status TEXT NOT NULL,          -- OPEN, CLOSED_PENDING_SYNC, SYNCED
  synced_at INTEGER
);

-- Sync metadata
CREATE TABLE sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Keys: last_sync_timestamp, snapshot_version, tenant_id, branch_id, user_id

-- Operation queue (pending uploads)
CREATE TABLE pending_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_type TEXT NOT NULL,  -- LOAN_APPLICATION, COLLECTION, MEDIA_UPLOAD, AGENT_DAY_CLOSE, etc.
  local_entity_id TEXT NOT NULL, -- Reference to local_id of the entity
  payload TEXT NOT NULL,         -- JSON payload to send to server
  created_at INTEGER NOT NULL,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  status TEXT NOT NULL           -- PENDING, UPLOADING, UPLOADED, FAILED
);

-- Sync conflicts (when server data differs from local pending changes)
CREATE TABLE sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_type TEXT NOT NULL,
  local_entity_id TEXT NOT NULL,
  local_data TEXT NOT NULL,      -- JSON of local version
  server_data TEXT NOT NULL,     -- JSON of server version
  resolution TEXT,               -- SERVER_WINS, LOCAL_WINS, MANUAL
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

-- Cached auth data
CREATE TABLE auth_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER
);
-- Keys: access_token, refresh_token, user_profile (encrypted JSON)
```

**Indexes for Performance:**
```sql
CREATE INDEX idx_customers_branch ON customers(branch_id, tenant_id);
CREATE INDEX idx_loans_customer ON loans(customer_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_loan_applications_status ON loan_applications(status);
CREATE INDEX idx_collections_loan ON collections(loan_id);
CREATE INDEX idx_collections_status ON collections(status);
CREATE INDEX idx_pending_operations_status ON pending_operations(status);
CREATE INDEX idx_media_upload_status ON loan_application_media(upload_status);
```

---

### 2. Sync Protocol

#### **Sync Flow Overview**

```
Agent Opens App
     ↓
Check Internet Connection
     ↓
   [OFFLINE]                    [ONLINE]
     ↓                              ↓
Use Cached Data          Check for Pending Operations
     ↓                              ↓
Allow Offline Work       Upload Pending Queue to Server
     ↓                              ↓
Queue Operations         Server Processes & Returns Results
     ↓                              ↓
Wait for Sync           Download Fresh Snapshot (if changes)
                                   ↓
                         Merge with Local Pending Operations
                                   ↓
                         Atomic Database Swap
                                   ↓
                         Update Sync Metadata
                                   ↓
                         Ready for Offline Work
```

#### **A. Download Phase (Full Snapshot)**

**API Endpoint:** `GET /api/v1/sync/snapshot`

**Query Parameters:**
- `lastSyncAt` (ISO timestamp) - for incremental sync optimization
- Server returns full or incremental snapshot based on changes

**Response Format:**
```json
{
  "version": "2026-08-18T10:30:00.000Z",
  "timestamp": "2026-08-18T10:30:00.000Z",
  "isIncremental": false,
  "data": {
    "customers": [
      {
        "id": "cust_123",
        "tenantId": "tenant_abc",
        "branchId": "branch_001",
        "nin": "CM123456",
        "firstName": "John",
        "lastName": "Doe",
        "phone": "+237600000001",
        "village": "Bamenda",
        "createdAt": "2026-01-15T08:00:00.000Z",
        "updatedAt": "2026-08-10T12:00:00.000Z"
      }
    ],
    "loans": [...],
    "loanProducts": [...],
    "agents": [...],
    "branches": [...]
  },
  "deletedIds": {
    "customers": ["cust_deleted_1"],
    "loans": ["loan_deleted_1"]
  }
}
```

**Client Logic:**
1. Download snapshot to temporary file
2. Validate integrity (checksum if provided)
3. Parse JSON
4. Begin transaction on temp database
5. Insert/update all records
6. Delete records in `deletedIds`
7. Commit transaction
8. Atomic rename: `rembeh_local_temp.db` → `rembeh_local.db`
9. Update sync_metadata

**Bandwidth Optimization:**
- Server sends only records updated since `lastSyncAt`
- Use gzip compression on response
- Limit snapshot size (e.g., max 50MB per sync)

#### **B. Upload Phase (Operation Queue)**

**API Endpoint:** `POST /api/v1/sync/upload-queue`

**Request Format:**
```json
{
  "operations": [
    {
      "localId": "local_loan_app_001",
      "type": "LOAN_APPLICATION_CREATE",
      "createdAt": "2026-08-17T14:30:00.000Z",
      "payload": {
        "applicantNin": "CM789012",
        "applicantFirstName": "Jane",
        "applicantLastName": "Smith",
        "applicantPhone": "+237600000002",
        "requestedAmount": 500000,
        "loanProductId": "prod_123",
        "mediaReferences": [
          {
            "localId": "local_media_001",
            "mediaType": "NATIONAL_ID"
          }
        ]
      }
    },
    {
      "localId": "local_collection_001",
      "type": "COLLECTION_CREATE",
      "createdAt": "2026-08-17T15:00:00.000Z",
      "payload": {
        "loanId": "loan_456",
        "customerId": "cust_123",
        "amount": 25000,
        "collectionDate": "2026-08-17T15:00:00.000Z",
        "receiptNumber": "REC-001"
      }
    }
  ]
}
```

**Response Format:**
```json
{
  "processed": [
    {
      "localId": "local_collection_001",
      "serverId": "collection_789",
      "status": "success"
    }
  ],
  "conflicts": [
    {
      "localId": "local_loan_app_001",
      "reason": "DUPLICATE_NIN",
      "message": "Customer with NIN CM789012 already has pending application",
      "serverData": {
        "existingApplicationId": "app_existing_123",
        "status": "PENDING_REVIEW"
      }
    }
  ],
  "errors": [
    {
      "localId": "local_media_001",
      "error": "INVALID_FILE_TYPE",
      "message": "Media type must be image/*"
    }
  ]
}
```

**Client Logic:**
1. Collect all operations with `status = PENDING` from `pending_operations`
2. Send to server in batches (max 50 operations per request)
3. Process response:
   - **Processed**: Update local entity with `serverId`, mark as `SYNCED`, delete from queue
   - **Conflicts**: Insert into `sync_conflicts`, mark operation as `CONFLICT`, notify user
   - **Errors**: Increment `retry_count`, update `last_error`, retry with exponential backoff
4. If all operations processed successfully, trigger snapshot download

**Idempotency:**
- Server checks `localId` to detect duplicate submissions
- If `localId` already processed, return existing `serverId` in response

#### **C. Media Upload (Photos, Signatures)**

**Flow:**
1. Agent captures photo → save to local storage with `localId`
2. Insert into `loan_application_media` with `upload_status = PENDING`
3. When online:
   - Request presigned S3 URL: `POST /api/v1/storage/presign`
   - Upload file to S3 directly
   - Confirm upload: `POST /api/v1/storage/confirm`
   - Update local record with `s3_key` and `upload_status = UPLOADED`
4. Reference uploaded media in loan application operation payload

**Compression:**
- Resize images to max 1920x1080 before upload
- JPEG quality 85%
- Target file size < 500KB per image

---

### 3. Offline Authentication

#### **Initial Login (Online Required)**

1. User enters email/phone + password
2. App calls `POST /api/v1/auth/login`
3. Server returns:
   ```json
   {
     "accessToken": "...",
     "refreshToken": "...",
     "user": {
       "id": "user_123",
       "tenantId": "tenant_abc",
       "branchId": "branch_001",
       "email": "agent@example.com",
       "displayName": "John Agent",
       "roles": ["AGENT"],
       "permissions": ["loans.create", "customers.view", ...]
     }
   }
   ```
4. App stores in secure storage:
   - `access_token` (encrypted)
   - `refresh_token` (encrypted)
   - `user_profile` (encrypted JSON)
   - `password_hash` (bcrypt hash of password for offline verification)

#### **Offline Login**

1. User enters email/phone + password
2. App retrieves cached `user_profile` and `password_hash`
3. Verify password against local hash using bcrypt
4. If valid:
   - Generate temporary offline session token (client-side JWT, not validated by server)
   - Allow app usage
   - Flag session as "offline" (show indicator in UI)
5. When internet returns:
   - Validate cached `access_token` with server
   - If expired, use `refresh_token` to get new tokens
   - If refresh fails, require online re-login

#### **Session Expiry Handling**

- Access tokens expire in 1 hour
- Refresh tokens expire in 30 days
- If offline for > 30 days:
  - App remains functional with cached data
  - On next online session, require full re-login
  - Pending operations uploaded before dropping local session

---

### 4. Conflict Resolution

**Conflict Scenarios:**

1. **Duplicate Submission**
   - Agent submits loan application offline
   - Same application uploaded multiple times due to sync retries
   - **Resolution**: Server detects `localId`, returns existing `serverId`

2. **Stale Data**
   - Agent views customer data synced 2 days ago
   - Customer updated by manager on web console
   - Agent's changes based on stale data
   - **Resolution**: Server wins, agent's changes rejected with conflict record

3. **Concurrent Edits**
   - Agent A and Agent B both update same loan offline
   - Both sync when online
   - **Resolution**: First sync wins, second marked as conflict

**Conflict Resolution UI:**
- Show conflicts in dedicated "Sync Issues" screen
- Display local vs server data side-by-side
- Options:
  - Accept server version (discard local)
  - Retry with updated data
  - Contact support (for complex cases)

---

### 5. Data Scoping Rules

**What each agent role downloads:**

| Role | Customers | Loans | Loan Applications | Collections | Loan Products | Agents | Branches |
|------|-----------|-------|-------------------|-------------|---------------|--------|----------|
| **Agent** | Own branch only | Own branch active loans | Own applications | Own collections | All active | Own branch | Own branch |
| **Manager** | Own branch | Own branch | Own branch | Own branch | All | Own branch | Own branch |
| **Cashier** | Own branch | Own branch | N/A | Own branch | All | Own branch | Own branch |

**Storage Estimates:**
- Average customer: ~500 bytes
- Average loan: ~800 bytes
- Average application: ~1KB
- 500 customers + 300 loans + 50 applications ≈ **1.5MB** (excluding media)
- With media thumbnails: **~10MB** typical, **50MB** max

**Storage Limits:**
- Warn at 100MB local DB size
- Block sync if < 200MB free space on device
- Auto-delete old closed agent days after 60 days

---

### 6. Error Handling & Edge Cases

#### **Interrupted Sync**

- Use atomic file operations (write to temp, rename on success)
- If download interrupted, keep old DB intact, retry download
- If upload interrupted, operations remain in queue for retry

#### **Storage Full**

- Check free space before sync
- If insufficient, prompt to free space or reduce data scope
- Allow clearing old cached media

#### **Server Unreachable for Extended Period**

- Agent works offline for weeks
- Queue grows large (hundreds of operations)
- **Solution**: Upload in batches, show progress, allow cancellation

#### **Corrupted Local Database**

- Checksum validation on app start
- If corrupted, show error, offer to re-sync from server
- Preserve `pending_operations` in separate backup file

#### **Version Mismatch (Schema Changes)**

- Include schema version in sync metadata
- If server returns newer schema version, prompt to update app
- Block sync until app updated

---

### 7. API Implementation (Server-Side)

**New Module:** `services/api/src/modules/sync/`

#### **sync.controller.ts**

```typescript
@Controller('sync')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('snapshot')
  @RequirePermissions('sync.download')
  async getSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Query('lastSyncAt') lastSyncAt?: string,
  ) {
    // Fetch all data scoped to user's tenant + branch
    // Return JSON snapshot
    return this.syncService.generateSnapshot(user, lastSyncAt);
  }

  @Post('upload-queue')
  @RequirePermissions('sync.upload')
  async uploadQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadQueueDto,
  ) {
    // Process operations, detect duplicates, handle conflicts
    return this.syncService.processOperationQueue(user, dto.operations);
  }
}
```

#### **sync.service.ts**

```typescript
@Injectable()
export class SyncService {
  async generateSnapshot(user: AuthenticatedUser, lastSyncAt?: string) {
    const { tenantId, branchId } = user;
    
    // Fetch data scoped to tenant + branch
    const [customers, loans, loanProducts, agents, branches] = await Promise.all([
      this.prisma.customer.findMany({
        where: { tenantId, branchId },
        where: lastSyncAt ? { updatedAt: { gte: new Date(lastSyncAt) } } : {},
      }),
      this.prisma.loan.findMany({
        where: { tenantId, branchId, status: { in: ['ACTIVE', 'OVERDUE'] } },
      }),
      this.prisma.loanProduct.findMany({
        where: { tenantId, isActive: true },
      }),
      // ... other entities
    ]);

    // Find deleted records (soft delete tracking table)
    const deletedIds = await this.getDeletedRecordsSince(tenantId, branchId, lastSyncAt);

    return {
      version: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      isIncremental: !!lastSyncAt,
      data: { customers, loans, loanProducts, agents, branches },
      deletedIds,
    };
  }

  async processOperationQueue(user: AuthenticatedUser, operations: Operation[]) {
    const processed = [];
    const conflicts = [];
    const errors = [];

    for (const op of operations) {
      // Check for duplicate localId
      const existing = await this.checkDuplicate(op.localId);
      if (existing) {
        processed.push({ localId: op.localId, serverId: existing.id, status: 'duplicate' });
        continue;
      }

      try {
        // Process operation based on type
        const result = await this.processOperation(user, op);
        processed.push({ localId: op.localId, serverId: result.id, status: 'success' });
      } catch (error) {
        if (error instanceof ConflictException) {
          conflicts.push({
            localId: op.localId,
            reason: error.message,
            serverData: error.details,
          });
        } else {
          errors.push({
            localId: op.localId,
            error: error.name,
            message: error.message,
          });
        }
      }
    }

    return { processed, conflicts, errors };
  }

  private async processOperation(user: AuthenticatedUser, op: Operation) {
    switch (op.type) {
      case 'LOAN_APPLICATION_CREATE':
        return this.loanApplicationsService.createFromSync(user, op.payload);
      case 'COLLECTION_CREATE':
        return this.collectionsService.createFromSync(user, op.payload);
      // ... other operation types
      default:
        throw new Error(`Unknown operation type: ${op.type}`);
    }
  }
}
```

---

### 8. Mobile Implementation (Flutter)

**Packages:**
- `sqflite` or `drift` - Local SQLite database
- `connectivity_plus` - Network connectivity monitoring
- `flutter_secure_storage` - Encrypted credential storage
- `dio` - HTTP client with retry logic
- `path_provider` - File system access
- `image_picker` & `camera` - Media capture
- `flutter_image_compress` - Image compression

**Directory Structure:**
```
lib/
  core/
    database/
      local_database.dart        # SQLite setup, migrations
      models/                    # Local entity models (Customer, Loan, etc.)
        customer_local.dart
        loan_local.dart
        loan_application_local.dart
      repositories/              # CRUD operations on local DB
        customers_repository.dart
        loans_repository.dart
    sync/
      sync_service.dart          # Orchestrates sync flow
      download_service.dart      # Snapshot download
      upload_service.dart        # Operation queue upload
      media_sync_service.dart    # Photo/signature upload
      conflict_resolver.dart     # Conflict handling
      connectivity_monitor.dart  # Network state listener
    auth/
      offline_auth_service.dart  # Offline credential validation
  features/
    sync/
      sync_screen.dart           # Manual sync UI
      sync_status_widget.dart    # Sync indicator
      conflict_resolution_screen.dart
```

**Key Services:**

**`SyncService` (lib/core/sync/sync_service.dart):**
```dart
class SyncService {
  final ApiClient apiClient;
  final LocalDatabase database;
  final DownloadService downloadService;
  final UploadService uploadService;
  final ConnectivityMonitor connectivityMonitor;

  Future<SyncResult> performFullSync() async {
    // 1. Check connectivity
    if (!await connectivityMonitor.isConnected()) {
      return SyncResult.noConnection();
    }

    // 2. Upload pending operations
    final uploadResult = await uploadService.uploadPendingQueue();
    if (uploadResult.hasErrors) {
      // Partial success, continue with download
    }

    // 3. Download fresh snapshot
    final lastSyncAt = await database.getLastSyncTimestamp();
    final snapshot = await downloadService.downloadSnapshot(lastSyncAt);

    // 4. Merge and swap database
    await database.mergeSnapshot(snapshot);

    // 5. Update sync metadata
    await database.updateSyncMetadata(snapshot.version);

    return SyncResult.success(
      uploadedCount: uploadResult.processedCount,
      downloadedCount: snapshot.recordCount,
      conflicts: uploadResult.conflicts,
    );
  }

  Stream<SyncStatus> get syncStatusStream {
    // Real-time sync status updates
  }
}
```

**`OfflineAuthService` (lib/core/auth/offline_auth_service.dart):**
```dart
class OfflineAuthService {
  final FlutterSecureStorage secureStorage;

  Future<AuthResult> loginOffline(String email, String password) async {
    // Retrieve cached user profile and password hash
    final cachedProfile = await secureStorage.read(key: 'user_profile');
    final passwordHash = await secureStorage.read(key: 'password_hash');

    if (cachedProfile == null || passwordHash == null) {
      return AuthResult.requireOnlineLogin();
    }

    // Verify password against cached hash
    final isValid = await bcrypt.verify(password, passwordHash);
    if (!isValid) {
      return AuthResult.invalidCredentials();
    }

    // Generate offline session token
    final userProfile = UserProfile.fromJson(jsonDecode(cachedProfile));
    final offlineToken = _generateOfflineToken(userProfile);

    return AuthResult.success(
      user: userProfile,
      token: offlineToken,
      isOffline: true,
    );
  }

  String _generateOfflineToken(UserProfile user) {
    // Client-side JWT for offline session tracking
    // Not validated by server, only used locally
    return JWT.encode(
      {
        'sub': user.id,
        'tenantId': user.tenantId,
        'offline': true,
        'iat': DateTime.now().millisecondsSinceEpoch,
        'exp': DateTime.now().add(Duration(days: 30)).millisecondsSinceEpoch,
      },
      secret: 'offline-secret-key', // Stored in secure storage
    );
  }
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [x] Design architecture (this document)
- [ ] Create SQLite schema and migrations
- [ ] Implement local database repositories
- [ ] Build sync metadata storage

### Phase 2: Core Sync (Week 2)
- [ ] Implement snapshot download service
- [ ] Build operation queue system
- [ ] Create upload service with retry logic
- [ ] Add idempotency tracking on server

### Phase 3: Authentication (Week 3)
- [ ] Implement offline auth service
- [ ] Add credential caching with encryption
- [ ] Handle token refresh and expiry

### Phase 4: Media Sync (Week 4)
- [ ] Implement media upload queue
- [ ] Add image compression
- [ ] Handle large file uploads with progress

### Phase 5: UI & UX (Week 5)
- [ ] Build sync status indicators
- [ ] Create manual sync screen
- [ ] Add conflict resolution UI
- [ ] Connectivity monitoring and auto-sync

### Phase 6: Testing & Optimization (Week 6)
- [ ] Test offline → online → offline transitions
- [ ] Simulate poor connectivity scenarios
- [ ] Load test with large datasets (1000+ customers)
- [ ] Optimize database queries and indexing

---

## Success Metrics

- **Sync Speed**: Full snapshot download < 10 seconds on 3G
- **Offline Duration**: Agent can work offline for 7+ days without issues
- **Data Integrity**: Zero data loss during sync operations
- **Conflict Rate**: < 1% of operations result in conflicts
- **Storage Efficiency**: Local DB < 50MB for typical agent workload
- **Battery Impact**: Sync operations consume < 5% battery per session

---

## Security Considerations

1. **Encrypted Storage**: All sensitive data (tokens, passwords) encrypted at rest
2. **Transport Security**: All API calls over HTTPS with certificate pinning
3. **Local Authentication**: Offline password verification doesn't expose hash over network
4. **Data Scoping**: Server enforces tenant + branch isolation, never trusts client-supplied IDs
5. **Audit Trail**: All sync operations logged with timestamps and user context

---

## Future Enhancements

1. **Delta Sync**: Instead of full snapshots, send only changed records
2. **Selective Sync**: Allow agents to choose what data to sync (e.g., only active loans)
3. **Conflict Merge Strategies**: Let users choose merge strategy per conflict type
4. **Background Sync**: Periodically sync in background when idle and connected to WiFi
5. **Multi-Device Sync**: Allow same agent to use multiple devices with shared data
6. **Offline Reports**: Generate reports from local data without server connection

---

*Document Version: 1.0*  
*Last Updated: 2026-08-18*  
*Author: Claude (AI Assistant)*
