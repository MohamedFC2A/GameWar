using System;
using UnityEngine;

namespace GameWar
{
    public class Health : MonoBehaviour
    {
        public event Action<Health> Died;
        public event Action<Health, float, float> Changed;

        [SerializeField]
        private float maxHealth = 100f;

        [SerializeField]
        private float currentHealth = 100f;

        [SerializeField]
        private float armor = 0f;

        [SerializeField]
        private float shieldCapacity = 0f;

        [SerializeField]
        private float shieldCurrent = 0f;

        [SerializeField]
        private float shieldRegenPerSecond = 0f;

        [SerializeField]
        private float shieldRegenDelay = 3f;

        private float shieldRegenTimer;
        private bool isDead;

        public float CurrentHealth
        {
            get { return currentHealth; }
        }

        public float MaxHealth
        {
            get { return maxHealth; }
        }

        public bool IsDead
        {
            get { return isDead; }
        }

        public void Configure(TankStats stats)
        {
            maxHealth = Mathf.Max(1f, stats.maxHealth);
            currentHealth = maxHealth;
            armor = Mathf.Max(0f, stats.armor);
            shieldCapacity = Mathf.Max(0f, stats.shieldCapacity);
            shieldCurrent = shieldCapacity;
            shieldRegenPerSecond = Mathf.Max(0f, stats.shieldRegenPerSecond);
            shieldRegenTimer = 0f;
            isDead = false;
            gameObject.SetActive(true);
            NotifyChanged();
        }

        private void Update()
        {
            if (isDead)
            {
                return;
            }

            if (shieldCurrent < shieldCapacity)
            {
                if (shieldRegenTimer > 0f)
                {
                    shieldRegenTimer -= Time.deltaTime;
                }
                else if (shieldRegenPerSecond > 0f)
                {
                    shieldCurrent = Mathf.Min(shieldCapacity, shieldCurrent + shieldRegenPerSecond * Time.deltaTime);
                    NotifyChanged();
                }
            }
        }

        public void TakeDamage(float rawDamage)
        {
            if (isDead)
            {
                return;
            }

            float damage = Mathf.Max(1f, rawDamage - armor);
            float remaining = damage;

            if (shieldCurrent > 0f)
            {
                float absorbed = Mathf.Min(shieldCurrent, remaining);
                shieldCurrent -= absorbed;
                remaining -= absorbed;
            }

            if (remaining > 0f)
            {
                currentHealth -= remaining;
            }

            shieldRegenTimer = shieldRegenDelay;
            NotifyChanged();

            if (currentHealth <= 0f)
            {
                Die();
            }
        }

        public void Heal(float amount)
        {
            if (isDead)
            {
                return;
            }

            currentHealth = Mathf.Min(maxHealth, currentHealth + Mathf.Max(0f, amount));
            NotifyChanged();
        }

        private void Die()
        {
            if (isDead)
            {
                return;
            }

            isDead = true;
            currentHealth = 0f;
            NotifyChanged();
            Died?.Invoke(this);
            gameObject.SetActive(false);
        }

        private void NotifyChanged()
        {
            Changed?.Invoke(this, currentHealth, maxHealth);
        }
    }
}
