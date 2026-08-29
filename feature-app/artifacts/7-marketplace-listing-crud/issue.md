# Marketplace listing CRUD

Source: https://github.com/lihongong/lifehack26/issues/7

## Issue

Need way to create and delete marketplace listings (admin permission only?)

## Clarification from repository evidence

The application has no `admin` role.
The existing Moderator role has broad Marketplace and Source Feed authority, while the Platform Operator controls operational gates and reads the immutable audit trail.
This implementation therefore grants create and delete access to Moderators and records both actions in the immutable audit log.
