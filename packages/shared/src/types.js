"use strict";
/**
 * Shared types used by both the server and the client.
 *
 * The Sleeper /v1/players/nfl endpoint returns an object keyed by `player_id`.
 * Many fields are nullable, missing, or empty strings, so we keep the type
 * permissive and surface only the bits the UI cares about as required.
 */
Object.defineProperty(exports, "__esModule", { value: true });
