/// <reference lib="dom" />

import { type FetchPage as IFetchPage } from "./api";

async function FetchPage(page: number): ReturnType<typeof IFetchPage> {
    const res = await fetch(`/page?page=${page}`);
    if (!res.ok) {
        return null;
    }

    return res.json();
}

// the timeout for the toast
let toastTimeout: globalThis.Timer | undefined = undefined;

function showToast() {
    const toast = document.getElementById("toast");
    if (!toast) {
        return;
    }

    toast.style.opacity = "1";
    toast.style.visibility = "visible";

    // we need to clear the timeout, in case the toast is shown while it's already visible, which results in the toast hiding too early
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.visibility = "hidden";
    }, 2000);
}

async function loadUsers(pageCursor: number) {
    const loadingIndicator = document.querySelector<HTMLParagraphElement>("#loading-indicator");
    if (!loadingIndicator) {
        throw new Error("Loading indicator not found");
    }

    loadingIndicator.style.display = "initial";
    const page = await FetchPage(pageCursor);
    if (!page) {
        loadingIndicator.style.display = "none";
        return false;
    }

    for (const user of page) {
        const podiumHTML = `<img src="${user.avatar}" loading="lazy"><span onclick="navigator.clipboard.writeText('${user.userid}')">${user.username}</span>`;
        const xpInfoHTML = `<span class="xp-popup">${user.progress[0]}/${Math.floor((user.progress[0] * 100) / user.progress[1])}</span>`;

        let podiumElement: HTMLDivElement | null = null;

        if (1 <= user.pos && user.pos <= 3) {
            if (user.pos === 1) {
                podiumElement = document.querySelector<HTMLDivElement>("#first");
            }
            if (user.pos === 2) {
                podiumElement = document.querySelector<HTMLDivElement>("#second");
            }
            if (user.pos === 3) {
                podiumElement = document.querySelector<HTMLDivElement>("#third");
            }

            if (!podiumElement) {
                throw new Error("Podium element not found");
            }

            // biome-ignore lint/style/noNonNullAssertion: <explanation>
            podiumElement.querySelector("h2")!.innerHTML = podiumHTML;
            // biome-ignore lint/style/noNonNullAssertion: <explanation>
            podiumElement.querySelector("#total-xp-level")!.innerHTML = `Level: ${user.level}<br>Total XP: ${user.xp}`;
            // biome-ignore lint/style/noNonNullAssertion: <explanation>
            podiumElement.querySelector("#xp")!.innerHTML = xpInfoHTML;

            continue;
        }

        const listings = document.querySelector("section");
        if (!listings) {
            throw new Error("Listings not found");
        }

        listings.insertAdjacentHTML(
            "beforeend",
            `<div class="user">
      <p class="pos">${user.pos}</p>
      <p class="name" onclick="navigator.clipboard.writeText('${user.userid}')"><img src="${user.avatar}" loading="lazy"><span>${user.username}</span></p>
      <label>
        <p><span>Level: ${user.level}</span><span>XP: ${user.xp}</span></p>
        <progress value="${user.progress[0]}" max="${(user.progress[0] * 100) / user.progress[1]}">${Math.floor((user.progress[0] * 100) / user.progress[1])}</progress>
        ${xpInfoHTML}
      </label>
    </div>`
        );
    }

    loadingIndicator.style.display = "none";
    return true;
}

// set up toast
document.addEventListener("click", function (event) {
    //@ts-ignore It does exist, idiot
    if (event.target?.closest(".name")) {
        showToast();
    }
});

let pageCursor = 0;

// Initial load
await loadUsers(pageCursor);
pageCursor++;

let doneLoading = true;
addEventListener("scroll", async () => {
    if (scrollY + innerHeight == document.body.clientHeight && doneLoading) {
        doneLoading = false;
        const success = await loadUsers(pageCursor).then((success) => {
            doneLoading = true;
            return success;
        });
        if (success) {
            pageCursor++;
        }
    }
});
