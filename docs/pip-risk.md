# PiP Risk Notes

## Summary

Picture in Picture should be treated as optional and experimental. It is not required for the MVP.

## Why PiP Is Risky

- iOS PiP is primarily designed for video playback and specific app behaviors.
- A tutoring companion UI may not qualify for stable PiP behavior.
- PiP controls are constrained and may not support intent selection well.
- Building around PiP too early could distract from the core study loop.

## Better First Alternatives

- iPhone Safari companion at `http://<mac-lan-ip>:3000/`.
- Desktop browser companion beside Goodnotes or screen mirroring.
- Later native iPhone/iPad companion app.
- Slide Over or Split View style companion if native iPad work starts.

## Decision Rule

Do not build PiP until:

- Mac server MVP works.
- Web companion works on iPhone Safari.
- Real provider path is usable.
- Session and manual frame flows are stable.
- Native iOS companion has a minimal working prototype.

If PiP is attempted later, make it a spike with explicit success criteria and keep the web companion fallback.
