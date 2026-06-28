const LOCAL_STORAGE_KEY = "couple-shopping-list:v1";
const SHARE_CODE_KEY = "couple-shopping-list:share-code";

console.log(window.SHOPPING_LIST_CONFIG);
console.log(window.supabase);
console.log(canUseCloud);


const LOCAL_STORAGE_KEY = "couple-shopping-list:v1";
const SHARE_CODE_KEY = "couple-shopping-list:share-code";

const addForm = document.querySelector("#addForm");
const syncForm = document.querySelector("#syncForm");
const itemInput = document.querySelector("#itemInput");
const shareCodeInput = document.querySelector("#shareCodeInput");
const syncStatus = document.querySelector("#syncStatus");
const plannedList = document.querySelector("#plannedList");
const purchasedList = document.querySelector("#purchasedList");
const plannedEmpty = document.querySelector("#plannedEmpty");
const purchasedEmpty = document.querySelector("#purchasedEmpty");
const activeCount = document.querySelector("#activeCount");
const plannedCount = document.querySelector("#plannedCount");
const purchasedCount = document.querySelector("#purchasedCount");
const itemTemplate = document.querySelector("#itemTemplate");

const config = window.SHOPPING_LIST_CONFIG || {};
const canUseCloud = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
const supabaseClient = canUseCloud
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

let items = [];
let listId = "";
let realtimeChannel = null;
let isCloudMode = false;

function loadLocalItems() {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalItems(nextItems) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextItems));
}

function sortItems(nextItems) {
  return [...nextItems].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function createItem(name) {
  const now = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
  return {
    id,
    name,
    purchased: false,
    createdAt: now,
    updatedAt: now,
  };
}

function toDatabaseItem(item) {
  return {
    id: item.id,
    list_id: listId,
    name: item.name,
    purchased: item.purchased,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function fromDatabaseItem(row) {
  return {
    id: row.id,
    name: row.name,
    purchased: row.purchased,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function makeListId(code) {
  const normalized = code.trim();
  if (!normalized) {
    return "";
  }

  if (!globalThis.crypto?.subtle) {
    return `local-${normalized}`;
  }

  const bytes = new TextEncoder().encode(normalized);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function setStatus(message, state = "") {
  syncStatus.textContent = message;
  syncStatus.classList.toggle("online", state === "online");
  syncStatus.classList.toggle("error", state === "error");
}

function render() {
  plannedList.textContent = "";
  purchasedList.textContent = "";

  const planned = items.filter((item) => !item.purchased);
  const purchased = items.filter((item) => item.purchased);

  for (const item of planned) {
    plannedList.append(renderItem(item));
  }

  for (const item of purchased) {
    purchasedList.append(renderItem(item));
  }

  activeCount.textContent = String(planned.length);
  plannedCount.textContent = `${planned.length}件`;
  purchasedCount.textContent = `${purchased.length}件`;
  plannedEmpty.classList.toggle("visible", planned.length === 0);
  purchasedEmpty.classList.toggle("visible", purchased.length === 0);
}

function renderItem(item) {
  const row = itemTemplate.content.firstElementChild.cloneNode(true);
  const checkbox = row.querySelector(".purchase-check");
  const editForm = row.querySelector(".edit-form");
  const nameInput = row.querySelector(".name-input");
  const deleteButton = row.querySelector(".delete-button");

  row.dataset.id = item.id;
  checkbox.checked = item.purchased;
  nameInput.value = item.name;

  checkbox.addEventListener("change", () => {
    updateItem(item.id, { purchased: checkbox.checked });
  });

  editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveName(item, nameInput);
  });

  nameInput.addEventListener("blur", () => {
    saveName(item, nameInput);
  });

  deleteButton.addEventListener("click", async () => {
    const confirmed = window.confirm(`「${item.name}」を削除しますか？`);
    if (!confirmed) {
      return;
    }
    await deleteItem(item.id);
  });

  return row;
}

function saveName(item, nameInput) {
  const nextName = nameInput.value.trim();
  if (!nextName) {
    nameInput.value = item.name;
    return;
  }
  if (nextName !== item.name) {
    updateItem(item.id, { name: nextName });
  }
  nameInput.blur();
}

async function addItem(name) {
  const item = createItem(name);
  items = sortItems([...items, item]);
  render();

  if (isCloudMode) {
    const { error } = await supabaseClient.from("shopping_items").insert(toDatabaseItem(item));
    if (error) {
      setStatus(`追加に失敗しました: ${error.message}`, "error");
      await loadCloudItems();
      return;
    }
  } else {
    saveLocalItems(items);
  }
}

async function updateItem(id, patch) {
  const updatedAt = new Date().toISOString();
  items = sortItems(items.map((item) => (item.id === id ? { ...item, ...patch, updatedAt } : item)));
  render();

  if (isCloudMode) {
    const cloudPatch = { updated_at: updatedAt };
    if (Object.prototype.hasOwnProperty.call(patch, "name")) {
      cloudPatch.name = patch.name;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "purchased")) {
      cloudPatch.purchased = patch.purchased;
    }

    const { error } = await supabaseClient
      .from("shopping_items")
      .update(cloudPatch)
      .eq("id", id)
      .eq("list_id", listId);
    if (error) {
      setStatus(`更新に失敗しました: ${error.message}`, "error");
      await loadCloudItems();
      return;
    }
  } else {
    saveLocalItems(items);
  }
}

async function deleteItem(id) {
  const previousItems = items;
  items = items.filter((item) => item.id !== id);
  render();

  if (isCloudMode) {
    const { error } = await supabaseClient.from("shopping_items").delete().eq("id", id).eq("list_id", listId);
    if (error) {
      items = previousItems;
      render();
      setStatus(`削除に失敗しました: ${error.message}`, "error");
      return;
    }
  } else {
    saveLocalItems(items);
  }
}

async function loadCloudItems() {
  const { data, error } = await supabaseClient
    .from("shopping_items")
    .select("*")
    .eq("list_id", listId)
    .order("created_at", { ascending: true });

  if (error) {
    setStatus(`同期に失敗しました: ${error.message}`, "error");
    return;
  }

  items = sortItems(data.map(fromDatabaseItem));
  render();
  setStatus("夫婦共有で同期中", "online");
}

function subscribeRealtime() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient
    .channel(`shopping_items:${listId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "shopping_items",
        filter: `list_id=eq.${listId}`,
      },
      () => {
        loadCloudItems();
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setStatus("夫婦共有で同期中", "online");
      }
    });
}

async function enableCloudMode(code) {
  if (!canUseCloud) {
    isCloudMode = false;
    setStatus("Supabase未設定のため、この端末内に保存中");
    return;
  }

  listId = await makeListId(code);
  if (!listId) {
    isCloudMode = false;
    setStatus("共有コード未設定のため、この端末内に保存中");
    return;
  }

  isCloudMode = true;
  localStorage.setItem(SHARE_CODE_KEY, code.trim());
  shareCodeInput.value = code.trim();
  shareCodeInput.type = "password";
  setStatus("クラウドから読み込み中...");
  await loadCloudItems();
  subscribeRealtime();
}

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = itemInput.value.trim();
  if (!name) {
    itemInput.focus();
    return;
  }

  itemInput.value = "";
  itemInput.focus();
  await addItem(name);
});

syncForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await enableCloudMode(shareCodeInput.value);
});

window.addEventListener("storage", (event) => {
  if (isCloudMode || event.key !== LOCAL_STORAGE_KEY) {
    return;
  }
  items = sortItems(loadLocalItems());
  render();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

async function start() {
  items = sortItems(loadLocalItems());
  render();

  const savedShareCode = localStorage.getItem(SHARE_CODE_KEY) || "";
  if (savedShareCode) {
    await enableCloudMode(savedShareCode);
    return;
  }

  if (canUseCloud) {
    setStatus("共有コードを設定すると夫婦で同期できます");
  } else {
    setStatus("Supabase未設定のため、この端末内に保存中");
  }
}

start();
