/*
 * Netflix/Prime Auto-Skip
 * Copyright (c) 2022 Marvin Krebber
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the  GNU General Public License v3.0.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License v3.0 for more details.
 */
// matches all amazon urls under https://en.wikipedia.org/wiki/Amazon_(company)#Website
let hostname = window.location.hostname;
let title = document.title;
let url = window.location.href;
let isAmazon = /amazon|primevideo/i.test(hostname);
let isVideo = /video/i.test(title) || /video/i.test(url);
let isNetflix = /netflix/i.test(hostname);
const version = "1.0.15";

if (isVideo || isNetflix) {
  // global variables in localStorage
  const defaultSettings = {
    settings: {
      Amazon: { skipIntro: true, skipCredits: true, skipAd: true, blockFreevee: true },
      Netflix: { skipIntro: true, skipRecap: true, skipCredits: true, skipBlocked: true },
      Statistics: { AmazonAdTimeSkipped: 0, IntroTimeSkipped: 0, RecapTimeSkipped: 0, SegmentsSkipped: 0 },
    },
  };
  let settings = defaultSettings.settings;
  let lastAdTimeText = "";
  resetBadge();
  browser.storage.sync.get("settings", function (result) {
    settings = result.settings;
    console.log("%cNetflix%c/%cPrime%c Auto-Skip", "color: #e60010;font-size: 2em;", "color: white;font-size: 2em;", "color: #00aeef;font-size: 2em;", "color: white;font-size: 2em;");
    console.log("version: ", version);
    console.log("Settings", settings);
    console.log("Page %cNetflix%cAmazon", isNetflix ? "color: #e60010;" : "display:none;", !isNetflix ? "color: #00aeef;" : "display:none;");
    if (typeof settings !== "object") {
      browser.storage.sync.set(defaultSettings);
    } else {
      if (isNetflix) {
        // start Observers depending on the settings
        if (settings.Netflix?.skipIntro) startNetflixSkipIntroObserver();
        if (settings.Netflix?.skipRecap) startNetflixSkipRecapObserver();
        if (settings.Netflix?.skipCredits) startNetflixSkipCreditsObserver();
        if (settings.Netflix?.skipBlocked) startNetflixSkipBlockedObserver();
      } else {
        if (settings.Amazon?.skipIntro) startAmazonSkipIntroObserver();
        if (settings.Amazon?.skipCredits) startAmazonSkipCreditsObserver();
        if (settings.Amazon?.skipAd) startAmazonSkipAdObserver();
        if (settings.Amazon?.blockFreevee) {
          // timeout of 100 ms because the ad is not loaded fast enough and the video will crash
          setTimeout(function () {
            startAmazonBlockFreeveeObserver();
          }, 200);
        }
      }
      // if there is an undefined setting, set it to the default
      let changedSettings = false;
      for (const key in defaultSettings.settings) {
        if (typeof settings[key] === "undefined") {
          console.log("undefined Setting:", key);
          changedSettings = true;
          settings[key] = defaultSettings.settings[key];
        } else {
          for (const subkey in defaultSettings.settings[key]) {
            if (typeof settings[key][subkey] === "undefined") {
              console.log("undefined Setting:", key, subkey);
              changedSettings = true;
              settings[key][subkey] = defaultSettings.settings[key][subkey];
            }
          }
        }
      }
      if (changedSettings) {
        browser.storage.sync.set({ settings });
      }
    }
  });

  browser.storage.sync.onChanged.addListener(function (changes, namespace) {
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
      if (key == "settings") {
        settings = newValue;
        console.log(key, "Old value:", oldValue, ", new value:", newValue);
        if (isNetflix) {
          // if value is changed then check if it is enabled or disabled
          if (oldValue === undefined || newValue.Netflix.skipIntro !== oldValue.Netflix.skipIntro) startNetflixSkipIntroObserver();
          if (oldValue === undefined || newValue.Netflix.skipRecap !== oldValue.Netflix.skipRecap) startNetflixSkipRecapObserver();
          if (oldValue === undefined || newValue.Netflix.skipCredits !== oldValue.Netflix.skipCredits) startNetflixSkipCreditsObserver();
          if (oldValue === undefined || newValue.Netflix.skipBlocked !== oldValue.Netflix.skipBlocked) startNetflixSkipBlockedObserver();
        } else {
          if (oldValue === undefined || newValue.Amazon.skipIntro !== oldValue.Amazon.skipIntro) startAmazonSkipIntroObserver();
          if (oldValue === undefined || newValue.Amazon.skipCredits !== oldValue.Amazon.skipCredits) startAmazonSkipCreditsObserver();
          if (oldValue === undefined || newValue.Amazon.skipAd !== oldValue.Amazon.skipAd) startAmazonSkipAdObserver();
          if (oldValue === undefined || newValue.Amazon.blockFreevee !== oldValue.Amazon.blockFreevee) startAmazonBlockFreeveeObserver();
        }
        if (oldValue === undefined || newValue.Statistics.AmazonAdTimeSkipped !== oldValue.Statistics.AmazonAdTimeSkipped) {
          settings.Statistics.AmazonAdTimeSkipped = newValue.Statistics.AmazonAdTimeSkipped;
        }
        if (oldValue === undefined || newValue.Statistics.IntroTimeSkipped !== oldValue.Statistics.IntroTimeSkipped) {
          settings.Statistics.IntroTimeSkipped = newValue.Statistics.IntroTimeSkipped;
        }
        if (oldValue === undefined || newValue.Statistics.RecapTimeSkipped !== oldValue.Statistics.RecapTimeSkipped) {
          settings.Statistics.RecapTimeSkipped = newValue.Statistics.RecapTimeSkipped;
        }
        if (oldValue === undefined || newValue.Statistics.SegmentsSkipped !== oldValue.Statistics.SegmentsSkipped) {
          settings.Statistics.SegmentsSkipped = newValue.Statistics.SegmentsSkipped;
          if (settings.Statistics.SegmentsSkipped === 0) {
            resetBadge();
          }
        }
      }
    }
  });
  function addIntroTimeSkipped(startTime, endTime) {
    if (typeof startTime === "number" && typeof endTime === "number" && endTime > startTime) {
      console.log("Intro Time skipped", endTime - startTime);
      settings.Statistics.IntroTimeSkipped += endTime - startTime;
      increaseBadge();
    }
  }
  function addRecapTimeSkipped(startTime, endTime) {
    if (typeof startTime === "number" && typeof endTime === "number" && endTime > startTime) {
      console.log("Recap Time skipped", endTime - startTime);
      settings.Statistics.RecapTimeSkipped += endTime - startTime;
      increaseBadge();
    }
  }

  // Observers
  // default Options for the observer (which mutations to observe)
  const config = { attributes: true, childList: true, subtree: true };
  // Netflix Observers
  const NetflixConfig = { attributes: true, attributeFilter: ["data-uia"], subtree: true, childList: true, attributeOldValue: false };
  const NetflixSkipIntroObserver = new MutationObserver(Netflix_intro);
  function Netflix_intro(mutations, observer) {
    for (let mutation of mutations) {
      for (let node of mutation.addedNodes) {
        let button = node.querySelector('[data-uia="player-skip-intro"]');
        if (button) {
          let video = document.querySelectorAll("video")[0];
          const time = video.currentTime;
          button.click();
          console.log("intro skipped", button);
          setTimeout(function () {
            // NetflixGoBackButton(video, time, video.currentTime);
            addIntroTimeSkipped(time, video.currentTime);
          }, 600);
          return;
        }
      }
    }
  }
  // this is the NetflixGoBackButton

  // uiEventsHappening = 0;
  // function showControls() {
  //   uiEventsHappening += 1;
  //   var scrubber = $("#scrubber-component");
  //   var eventOptions = {
  //     bubbles: true,
  //     button: 0,
  //     currentTarget: scrubber[0],
  //   };
  //   scrubber[0].dispatchEvent(new MouseEvent("mousemove", eventOptions));
  //   return delay(10)().then(function () {
  //     uiEventsHappening -= 1;
  //   });
  // }
  // showControls();
  // function seek(milliseconds) {
  //   uiEventsHappening += 1;
  //   var eventOptions, scrubber;
  //   return showControls()
  //     .then(function () {
  //       // compute the parameters for the mouse events
  //       scrubber = $("#scrubber-component");
  //       var factor = milliseconds / getDuration();
  //       var mouseX = scrubber.offset().left + Math.round(scrubber.width() * factor); // relative to the document
  //       var mouseY = scrubber.offset().top + scrubber.height() / 2; // relative to the document
  //       eventOptions = {
  //         bubbles: true,
  //         button: 0,
  //         screenX: mouseX - $(window).scrollLeft(),
  //         screenY: mouseY - $(window).scrollTop(),
  //         clientX: mouseX - $(window).scrollLeft(),
  //         clientY: mouseY - $(window).scrollTop(),
  //         offsetX: mouseX - scrubber.offset().left,
  //         offsetY: mouseY - scrubber.offset().top,
  //         pageX: mouseX,
  //         pageY: mouseY,
  //         currentTarget: scrubber[0],
  //       };

  //       // make the "trickplay preview" show up
  //       scrubber[0].dispatchEvent(new MouseEvent("mouseover", eventOptions));
  //     })
  //     .then(delay(10))
  //     .then(function () {
  //       // simulate a click on the scrubber
  //       scrubber[0].dispatchEvent(new MouseEvent("mousedown", eventOptions));
  //       scrubber[0].dispatchEvent(new MouseEvent("mouseup", eventOptions));
  //       scrubber[0].dispatchEvent(new MouseEvent("mouseout", eventOptions));
  //     })
  //     .then(delay(1))
  //     .then(hideControls)
  //     .then(function () {
  //       uiEventsHappening -= 1;
  //     });
  // }

  // reverseButton = false;
  // function NetflixGoBackButton(video, startTime, endTime) {
  //   if (!reverseButton) {
  //     reverseButton = true;
  //     // go back button
  //     const button = document.createElement("button");
  //     button.setAttribute("class", "button-primary watch-video--skip-content-button medium hasLabel");
  //     button.type = "button";
  //     button.setAttribute("data-uia", "reverse-button");
  //     button.style = "position: absolute; left: 85%; bottom: 16%; color: #181818; border-radius: 5px;padding: 0.5rem 1rem;";
  //     const span = document.createElement("span");
  //     span.setAttribute("class", "ltr-10qgxi");
  //     span.textContent = "Watch skipped ?";
  //     button.appendChild(span);
  //     document.querySelector('[data-uia="watch-video-player-view-minimized"]').appendChild(button);
  //     buttonInHTML = document.querySelector('[data-uia="reverse-button"]');
  //     function goBack() {
  //       showControls();
  //       video.currentTime = startTime;
  //       buttonInHTML.remove();
  //       console.log("stopped observing| Intro");
  //       NetflixSkipIntroObserver.disconnect();
  //       waitTime = endTime - startTime + 2;
  //       // console.log("waiting for:", waitTime);
  //       setTimeout(function () {
  //         console.log("restarted observing| Intro");
  //         NetflixSkipIntroObserver.observe(document, AmazonSkipIntroConfig);
  //       }, waitTime * 1000);
  //     }
  //     buttonInHTML.addEventListener("click", goBack);
  //     setTimeout(() => {
  //       buttonInHTML.remove();
  //       reverseButton = false;
  //     }, 5000);
  //   }
  // }

  const NetflixSkipRecapObserver = new MutationObserver(Netflix_Recap);
  function Netflix_Recap(mutations, observer) {
    for (let mutation of mutations) {
      for (let node of mutation.addedNodes) {
        let button = node.querySelector('[data-uia="player-skip-recap"]') || node.querySelector('[data-uia="player-skip-preplay"]');
        if (button) {
          let video = document.querySelectorAll("video")[0];
          const time = video.currentTime;
          button.click();
          console.log("Recap skipped", button);
          setTimeout(function () {
            addRecapTimeSkipped(time, video.currentTime);
          }, 600);
          return;
        }
      }
    }
  }

  const NetflixSkipCreditsObserver = new MutationObserver(Netflix_Credits);
  function Netflix_Credits(mutations, observer) {
    let button = document.querySelector('[data-uia="next-episode-seamless-button"]');
    if (button) {
      button.click();
      console.log("Credits skipped", button);
      increaseBadge();
    }
  }

  const NetflixSkipBlockedObserver = new MutationObserver(Netflix_Blocked);
  function Netflix_Blocked(mutations, observer) {
    for (let mutation of mutations) {
      for (let node of mutation.addedNodes) {
        let button = node.querySelector('[data-uia="interrupt-autoplay-continue"]');
        if (button) {
          button.click();
          console.log("Blocked skipped", button);
          increaseBadge();
          return;
        }
      }
    }
  }

  // Amazon Observers
  const AmazonSkipIntroConfig = { attributes: true, attributeFilter: [".skipelement"], subtree: true, childList: true, attributeOldValue: false };
  // const AmazonSkipIntro = new RegExp("skipelement", "i");
  const AmazonSkipIntroObserver = new MutationObserver(Amazon_Intro);
  function Amazon_Intro(mutations, observer) {
    let button = document.querySelector("[class*=skipelement]");
    if (button) {
      let video = document.querySelector("#dv-web-player > div > div:nth-child(1) > div > div > div.scalingVideoContainer > div.scalingVideoContainerBottom > div > video");
      const time = video.currentTime;
      button.click();
      console.log("Intro skipped", button);
      //delay where the video is loaded
      setTimeout(function () {
        AmazonGobackbutton(video, time, video.currentTime);
        addIntroTimeSkipped(time, video.currentTime);
      }, 50);
    }
  }
  reverseButton = false;
  function AmazonGobackbutton(video, startTime, endTime) {
    if (!reverseButton) {
      reverseButton = true;
      // go back button
      const button = document.createElement("button");
      button.style = "padding: 0px 22px; line-height: normal; min-width: 0px";
      button.setAttribute("class", "fqye4e3 f1ly7q5u fk9c3ap fz9ydgy f1xrlb00 f1hy0e6n fgbpje3 f1uteees f1h2a8xb  f1cg7427 fiqc9rt fg426ew f1ekwadg");
      button.setAttribute("data-uia", "reverse-button");
      button.textContent = "Watch skipped ?";
      document.querySelector(".f18oq18q.f6suwnu.fhxjtbc.f1ngx5al").appendChild(button);
      buttonInHTML = document.querySelector('[data-uia="reverse-button"]');
      function goBack() {
        video.currentTime = startTime;
        buttonInHTML.remove();
        console.log("stopped observing| Intro");
        AmazonSkipIntroObserver.disconnect();
        waitTime = endTime - startTime + 2;
        // console.log("waiting for:", waitTime);
        setTimeout(function () {
          console.log("restarted observing| Intro");
          AmazonSkipIntroObserver.observe(document, AmazonSkipIntroConfig);
        }, waitTime * 1000);
      }
      buttonInHTML.addEventListener("click", goBack);
      setTimeout(() => {
        buttonInHTML.remove();
        reverseButton = false;
      }, 5000);
    }
  }

  const AmazonSkipCreditsConfig = { attributes: true, attributeFilter: [".nextupcard"], subtree: true, childList: true, attributeOldValue: false };
  const AmazonSkipCredits = new RegExp("nextupcard", "i");
  const AmazonSkipCredits2 = new RegExp("nextupcard-button", "i");
  const AmazonSkipCreditsObserver = new MutationObserver(Amazon_Credits);
  function Amazon_Credits(mutations, observer) {
    for (let mutation of mutations) {
      if (AmazonSkipCredits.test(mutation.target.classList.toString())) {
        for (let button of mutation?.target?.firstChild?.childNodes) {
          if (button && AmazonSkipCredits2.test(button.classList.toString())) {
            button.click();
            increaseBadge();
            console.log("skipped Credits", button);
            return;
          }
        }
      }
    }
  }

  const FreeVeeConfig = { attributes: true, attributeFilter: [".atvwebplayersdk-adtimeindicator-text"], subtree: true, childList: true, attributeOldValue: false };
  const AmazonFreeVeeObserver = new MutationObserver(AmazonFreeVee);
  async function AmazonFreeVee(mutations, observer) {
    let video = document.querySelector("#dv-web-player > div > div:nth-child(1) > div > div > div.scalingVideoContainer > div.scalingVideoContainerBottom > div > video");
    let adTimeText = document.querySelector(".atvwebplayersdk-adtimeindicator-text");
    // adTimeText.textContent.length > 7 so it doesn't try to skip when the self ad is playing
    // !document.querySelector(".fu4rd6c.f1cw2swo") so it doesn't try to skip when the self ad is playing
    if (!document.querySelector(".fu4rd6c.f1cw2swo") && video != null && adTimeText != null && lastAdTimeText != adTimeText.textContent) {
      lastAdTimeText = adTimeText.textContent;
      resetLastATimeText();
      const adTime = parseInt(adTimeText.textContent.match(/\d+/)[0]);
      if (typeof adTime === "number") {
        video.currentTime += adTime;
        console.log("FreeVee Ad skipped, length:", adTime, "s");
        settings.Statistics.AmazonAdTimeSkipped += adTime;
        increaseBadge();
      }
    }
  }
  async function resetLastATimeText(time = 1000) {
    // timeout of 1 second to make sure the button is not pressed too fast, it will crash or slow the website otherwise
    setTimeout(() => {
      lastAdTimeText = "";
    }, time);
  }

  // const AmazonSkipAdObserver = new MutationObserver(Amazon_Ad);
  // async function Amazon_Ad(mutations, observer) {
  //   // web player is shown
  //   if (getComputedStyle(document.querySelector("#dv-web-player")).display != "none") {
  //     for (let mutation of mutations) {
  //       if (mutation.target.classList.contains("atvwebplayersdk-infobar-container")) {
  //         let button = mutation.target.querySelector(".fu4rd6c.f1cw2swo");
  //         if (button) {
  //           button.click();
  //           // only getting the time after :08
  //           const adTime = parseInt(
  //             document
  //               .querySelector(".atvwebplayersdk-adtimeindicator-text")
  //               .innerHTML.match(/[:]\d+/)[0]
  //               .substring(1)
  //           );
  //           // if adTime is number
  //           if (typeof adTime === "number") {
  //             settings.Statistics.AmazonAdTimeSkipped += adTime;
  //           }
  //           increaseBadge();
  //           console.log("Self Ad skipped, length:", adTime, button);
  //           return;
  //         }
  //       }
  //     }
  //   }
  // }
  async function Amazon_AdTimeout() {
    // set loop every 1 sec and check if ad is there
    let AdInterval = setInterval(function () {
      if (!settings.Amazon.skipAd) {
        console.log("stopped observing| Self Ad");
        clearInterval(AdInterval);
        return;
      }
      let video = document.querySelector("#dv-web-player > div > div:nth-child(1) > div > div > div.scalingVideoContainer > div.scalingVideoContainerBottom > div > video");
      if (video) {
        video.onplay = function () {
          // console.log("started playing video");
          // if video is playing
          if (getComputedStyle(document.querySelector("#dv-web-player")).display != "none") {
            let button = document.querySelector(".fu4rd6c.f1cw2swo");
            if (button) {
              // only getting the time after :08
              let adTime = parseInt(
                document
                  .querySelector(".atvwebplayersdk-adtimeindicator-text")
                  .innerHTML.match(/[:]\d+/)[0]
                  .substring(1)
              );
              // wait for 100ms before skipping to make sure the button is not pressed too fast, or there will be inifinite loading
              setTimeout(() => {
                if (button) {
                  button.click();
                  if (typeof adTime === "number") settings.Statistics.AmazonAdTimeSkipped += adTime;
                  increaseBadge();
                  console.log("Self Ad skipped, length:", adTime, button);
                }
              }, 100);
            }
          }
        };
      }
    }, 100);
  }

  // start/stop the observers depending on settings
  async function startNetflixSkipIntroObserver() {
    if (settings.Netflix.skipIntro === undefined || settings.Netflix.skipIntro) {
      console.log("started observing| intro");
      let button = document.querySelector('[data-uia="player-skip-intro"]');
      if (button) {
        let video = document.querySelectorAll("video")[0];
        const time = video.currentTime;
        button.click();
        console.log("intro skipped", button);
        setTimeout(function () {
          addIntroTimeSkipped(time, video.currentTime);
        }, 600);
      }
      NetflixSkipIntroObserver.observe(document, NetflixConfig);
    } else {
      console.log("stopped observing| intro");
      NetflixSkipIntroObserver.disconnect();
    }
  }
  async function startNetflixSkipRecapObserver() {
    if (settings.Netflix.skipRecap === undefined || settings.Netflix.skipRecap) {
      console.log("started observing| Recap");
      let button = document.querySelector('[data-uia="player-skip-recap"]') || document.querySelector('[data-uia="player-skip-preplay"]');
      if (button) {
        let video = document.querySelectorAll("video")[0];
        const time = video.currentTime;
        button.click();
        console.log("Recap skipped", button);
        setTimeout(function () {
          addRecapTimeSkipped(time, video.currentTime);
        }, 600);
      }
      NetflixSkipRecapObserver.observe(document, NetflixConfig);
    } else {
      console.log("stopped observing| Recap");
      NetflixSkipRecapObserver.disconnect();
    }
  }
  async function startNetflixSkipCreditsObserver() {
    if (settings.Netflix.skipCredits === undefined || settings.Netflix.skipCredits) {
      console.log("started observing| Credits");
      let button = document.querySelector('[data-uia="next-episode-seamless-button"]');
      if (button) {
        button.click();
        console.log("Credits skipped", button);
      }
      NetflixSkipCreditsObserver.observe(document, NetflixConfig);
    } else {
      console.log("stopped observing| Credits");
      NetflixSkipCreditsObserver.disconnect();
    }
  }
  async function startNetflixSkipBlockedObserver() {
    if (settings.Netflix.skipBlocked === undefined || settings.Netflix.skipBlocked) {
      console.log("started observing| Blocked");
      let button = document.querySelector('[data-uia="interrupt-autoplay-continue"]');
      if (button) {
        button.click();
        console.log("Blocked skipped", button);
      }
      NetflixSkipBlockedObserver.observe(document, NetflixConfig);
    } else {
      console.log("stopped observing| Blocked");
      NetflixSkipBlockedObserver.disconnect();
    }
  }
  async function startAmazonSkipIntroObserver() {
    if (settings.Amazon.skipIntro === undefined || settings.Amazon.skipIntro) {
      console.log("started observing| Intro");
      let button = document.querySelector("[class*=skipelement]");
      if (button) {
        let video = document.querySelector("#dv-web-player > div > div:nth-child(1) > div > div > div.scalingVideoContainer > div.scalingVideoContainerBottom > div > video");
        const time = video.currentTime;
        button.click();
        console.log("Intro skipped", button);
        //delay where the video is loaded
        setTimeout(function () {
          addIntroTimeSkipped(time, video.currentTime);
        }, 50);
      }
      AmazonSkipIntroObserver.observe(document, AmazonSkipIntroConfig);
    } else {
      console.log("stopped observing| Intro");
      AmazonSkipIntroObserver.disconnect();
    }
  }
  async function startAmazonSkipCreditsObserver() {
    if (settings.Amazon.skipCredits === undefined || settings.Amazon.skipCredits) {
      console.log("started observing| Credits");
      let button = document.querySelector("[class*=nextupcard-button]");
      if (button) {
        button.click();
        console.log("Credits skipped", button);
      }
      AmazonSkipCreditsObserver.observe(document, AmazonSkipCreditsConfig);
    } else {
      console.log("stopped observing| Credits");
      AmazonSkipCreditsObserver.disconnect();
    }
  }
  async function startAmazonSkipAdObserver() {
    if (settings.Amazon.skipAd === undefined || settings.Amazon.skipAd) {
      console.log("started observing| Self Ad");
      // only necessary for observer
      /*
      if (getComputedStyle(document.querySelector("#dv-web-player")).display != "none") {
        let button = document.querySelector(".fu4rd6c.f1cw2swo");
        if (button) {
          button.click();
          // only getting the time after :08
          let adTime = parseInt(
            document
              .querySelector(".atvwebplayersdk-adtimeindicator-text")
              .innerHTML.match(/[:]\d+/)[0]
              .substring(1)
          );
          // if adTime is number
          if (typeof adTime === "number") settings.Statistics.AmazonAdTimeSkipped += adTime;
          browser.storage.sync.set({ settings });
          console.log("Self Ad skipped, length:", adTime, button);
        }
      }
      AmazonSkipAdObserver.observe(document, config);
      */
      Amazon_AdTimeout();
    }
    /*
    else {
      console.log("stopped observing| Self Ad");
      AmazonSkipAdObserver.disconnect();
    }
    */
  }
  async function startAmazonBlockFreeveeObserver() {
    if (settings.Amazon.blockFreevee === undefined || settings.Amazon.blockFreevee) {
      console.log("started observing| FreeVee Ad");

      //skip add if turn on
      let video = document.querySelector("#dv-web-player > div > div:nth-child(1) > div > div > div.scalingVideoContainer > div.scalingVideoContainerBottom > div > video");
      let adTimeText = document.querySelector(".atvwebplayersdk-adtimeindicator-text");
      // adTimeText.textContent.length > 7 so it doesn't try to skip when the self ad is playing
      // !document.querySelector(".fu4rd6c.f1cw2swo") so it doesn't try to skip when the self ad is playing
      if (!document.querySelector(".fu4rd6c.f1cw2swo") && video != null && adTimeText != null && lastAdTimeText != adTimeText.textContent) {
        lastAdTimeText = adTimeText.textContent;
        resetLastATimeText();
        const adTime = parseInt(adTimeText.textContent.match(/\d+/)[0]);
        if (typeof adTime === "number") {
          video.currentTime += adTime;
          console.log("FreeVee Ad skipped, length:", adTime, "s");
          settings.Statistics.AmazonAdTimeSkipped += adTime;
          increaseBadge();
        }
      }
      AmazonFreeVeeObserver.observe(document, FreeVeeConfig);
    } else {
      console.log("stopped observing| FreeVee Ad");
      AmazonFreeVeeObserver.disconnect();
    }
  }
  // Badge functions

  function setBadgeText(text) {
    browser.runtime.sendMessage({
      type: "setBadgeText",
      content: text,
    });
  }
  function increaseBadge() {
    settings.Statistics.SegmentsSkipped++;
    browser.storage.sync.set({ settings });
    browser.runtime.sendMessage({
      type: "increaseBadge",
    });
  }
  function resetBadge() {
    chrome.runtime.sendMessage({
      type: "resetBadge",
    });
  }
}
