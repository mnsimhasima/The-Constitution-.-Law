# Security Specification — The Constitution & Law (Mobile + Backend RBAC CMS)

## 1. Data Invariants
1. **Strict RBAC Source of Truth**: Roles (`admin`, `editor`, `reviewer`, `security`) live exclusively in `/staffRoles/{uid}` (plus verified bootstrapped admin email `mnsimhasima@gmail.com`). Regular users cannot assign or escalate roles in `/staffRoles` or `/userDirectory`.
2. **Editorial Publish Gate**: Editors can create and edit `cmsBooks` with status `draft` or `pending_review`, but cannot transition status directly to `published`. Only `reviewer` or `admin` can publish or request changes.
3. **Reviewer Scope Restriction**: Reviewers can inspect all `cmsBooks` and `audioTracks`, play audio, and update only review/publish fields (`status`, `reviewNotes`, `reviewedByEmail`, `updatedAt`); they cannot modify user roles, settings, or delete books.
4. **Security Role Isolation**: Security staff can view `/userDirectory` sign-in records and manage `/supportTickets`, plus moderate `/communityPosts`, but cannot edit or publish books or modify `/staffRoles`.
5. **PII & Private Ticket Isolation**: `/users/{uid}` and `/supportTickets/{ticketId}` restrict reads to the document owner or authorized `admin`/`security` staff.
6. **Immutable Audit Trail**: `/auditLogs/{logId}` entries can only be created by verified staff with matching `actorUid == request.auth.uid` and can never be updated or deleted.
7. **Text-Only Moderated Community**: `/communityPosts/{postId}` requires verified authentication, strict length limits (`8..1000` chars), `likesCount == 0` on creation, and `moderationStatus == 'approved'`.
8. **Content-Node Audio Metadata Integrity**: `/contentAudioMetadata/{audioId}` binds every uploaded audio file to a specific `contentNodeId`, `contentNodeType` (`article`, `section`, `clause`), `blockRole`, strict audio MIME allowlist, and 10 MB `byteSize` cap; editors cannot bypass review to set `status: "published"`, and `uploadedByUid` / `createdAt` are immutable.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return `PERMISSION_DENIED`)
1. **Self-Role Escalation**: Regular user writes `/staffRoles/{myUid}` with `{ role: "admin" }`.
2. **Unverified Admin Email Spoof**: Caller has token email `mnsimhasima@gmail.com` with `email_verified: false` attempting to read `/userDirectory`.
3. **Editor Bypassing Reviewer Gate**: Editor attempts to update `/cmsBooks/{bookId}` setting `status: "published"`.
4. **Reviewer Editing Book Content**: Reviewer attempts to mutate `chapters` or `title` on `/cmsBooks/{bookId}` instead of only review fields.
5. **Security Role Modifying System Settings**: Security user attempts to update `/systemSettings/default`.
6. **Directory Role Tampering**: Standard user updates `/userDirectory/{myUid}` attempting to change `role: "admin"` or `status: "active"`.
7. **Shadow Field Injection on Community Post**: User creates `/communityPosts/{id}` with extra field `isPinned: true`.
8. **Inflated Initial Likes**: User creates `/communityPosts/{id}` with `likesCount: 9999`.
9. **Reading Another User's Support Ticket**: User A tries `get` on `/supportTickets/{ticketOfUserB}`.
10. **User Self-Resolving Support Ticket**: User A updates `/supportTickets/{ownTicket}` trying to set `status: "resolved"` and `assignedTo: "admin"`.
11. **Audit Log Tampering**: Even an Admin attempts `update` or `delete` on `/auditLogs/{logId}`.
12. **Oversized Document ID Poisoning**: Attacker writes `/cmsBooks/<300-char-invalid-id>` with non-alphanumeric characters.
13. **Content Audio MIME / Size / Shadow Poisoning**: Editor creates `/contentAudioMetadata/{audioId}` with `mimeType: "text/html"`, `byteSize: 99999999`, `status: "published"`, or extra shadow key `isAdminApproved: true`.
14. **Reviewer Tampering with Linked Audio URL**: Reviewer updates `/contentAudioMetadata/{audioId}` trying to replace `audioUrl` or `contentNodeId` instead of only `status` and `updatedAt`.
