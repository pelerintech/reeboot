# Rolling window — hot memory stays bounded in size

## ID: hot-memory-10

**Given** hot memory has 6 entries (at capacity)  
**When** a new session distillation writes a 7th entry  
**Then** the oldest entry is pruned  
**And** hot memory contains exactly 6 entries after the write

---

## ID: hot-memory-11

**Given** hot memory has entries older than 3 days  
**When** a new session distillation triggers a write  
**Then** entries older than 3 days are pruned  
**Unless** that would leave fewer than 4 entries — in which case the 4 most recent entries are kept regardless of age

---

## ID: hot-memory-12

**Given** multiple sessions occur in the same day  
**When** hot memory reaches 6 entries  
**Then** the oldest entry (even if from the same day) is replaced by the newest summary  
**And** the total stays at 6
