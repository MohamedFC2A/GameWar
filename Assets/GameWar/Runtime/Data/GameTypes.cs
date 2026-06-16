using System;
using System.Collections.Generic;
using UnityEngine;

namespace GameWar
{
    public enum MatchState
    {
        Loading,
        Playing,
        Upgrade,
        Victory,
        Defeat
    }

    public enum TeamKind
    {
        Player,
        Enemy
    }

    public enum EnemyArchetype
    {
        Grunt,
        Striker,
        Sniper,
        Boss
    }

    [Flags]
    public enum TankFeature
    {
        None = 0,
        ExplosiveShells = 1 << 0,
        PiercingShells = 1 << 1,
        SlowingShells = 1 << 2,
        ShieldBurst = 1 << 3,
        DashModule = 1 << 4,
        Ricochet = 1 << 5
    }

    [Serializable]
    public struct TankStats
    {
        public float maxHealth;
        public float damage;
        public float fireRate;
        public float moveSpeed;
        public float armor;
        public float projectileSpeed;
        public float projectileRange;
        public int projectilePierce;
        public float splashRadius;
        public float slowMultiplier;
        public float slowDuration;
        public float shieldCapacity;
        public float shieldRegenPerSecond;
        public float turnSpeed;
        public TankFeature features;

        public static TankStats CreatePlayerDefault()
        {
            TankStats stats = new TankStats();
            stats.maxHealth = 150f;
            stats.damage = 20f;
            stats.fireRate = 1.6f;
            stats.moveSpeed = 6.5f;
            stats.armor = 2f;
            stats.projectileSpeed = 18f;
            stats.projectileRange = 18f;
            stats.projectilePierce = 0;
            stats.splashRadius = 0f;
            stats.slowMultiplier = 0.85f;
            stats.slowDuration = 1.2f;
            stats.shieldCapacity = 20f;
            stats.shieldRegenPerSecond = 3f;
            stats.turnSpeed = 10f;
            stats.features = TankFeature.None;
            return stats;
        }

        public static TankStats CreateEnemyDefault()
        {
            TankStats stats = new TankStats();
            stats.maxHealth = 80f;
            stats.damage = 12f;
            stats.fireRate = 1f;
            stats.moveSpeed = 4.5f;
            stats.armor = 0.5f;
            stats.projectileSpeed = 14f;
            stats.projectileRange = 15f;
            stats.projectilePierce = 0;
            stats.splashRadius = 0f;
            stats.slowMultiplier = 0.9f;
            stats.slowDuration = 0.7f;
            stats.shieldCapacity = 0f;
            stats.shieldRegenPerSecond = 0f;
            stats.turnSpeed = 8f;
            stats.features = TankFeature.None;
            return stats;
        }

        public float FireCooldown
        {
            get { return fireRate <= 0.01f ? 999f : 1f / fireRate; }
        }

        public TankStats WithAddedHealth(float amount)
        {
            TankStats copy = this;
            copy.maxHealth += amount;
            return copy;
        }
    }

    [Serializable]
    public struct StatModifier
    {
        public float addMaxHealth;
        public float addDamage;
        public float addFireRate;
        public float addMoveSpeed;
        public float addArmor;
        public float addProjectileSpeed;
        public float addProjectileRange;
        public int addProjectilePierce;
        public float addSplashRadius;
        public float addSlowMultiplier;
        public float addSlowDuration;
        public float addShieldCapacity;
        public float addShieldRegenPerSecond;
        public float addTurnSpeed;
        public TankFeature addFeatures;

        public void ApplyTo(ref TankStats stats)
        {
            stats.maxHealth += addMaxHealth;
            stats.damage += addDamage;
            stats.fireRate += addFireRate;
            stats.moveSpeed += addMoveSpeed;
            stats.armor += addArmor;
            stats.projectileSpeed += addProjectileSpeed;
            stats.projectileRange += addProjectileRange;
            stats.projectilePierce += addProjectilePierce;
            stats.splashRadius += addSplashRadius;
            stats.slowMultiplier += addSlowMultiplier;
            stats.slowDuration += addSlowDuration;
            stats.shieldCapacity += addShieldCapacity;
            stats.shieldRegenPerSecond += addShieldRegenPerSecond;
            stats.turnSpeed += addTurnSpeed;
            stats.features |= addFeatures;
        }
    }

    [Serializable]
    public class EnemyWaveDefinition
    {
        public EnemyArchetype archetype = EnemyArchetype.Grunt;
        public int count = 3;
        public float spawnInterval = 0.7f;
        public float healthMultiplier = 1f;
        public float damageMultiplier = 1f;
        public float speedMultiplier = 1f;
        public float fireRateMultiplier = 1f;
    }

    [Serializable]
    public class SaveProfile
    {
        public int currentStageIndex = 1;
        public int highestStageIndex = 1;
        public int currency = 0;
        public List<string> unlockedUpgradeIds = new List<string>();
        public List<string> clearedStageIds = new List<string>();
    }
}
