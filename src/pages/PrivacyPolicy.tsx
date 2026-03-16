const PrivacyPolicy = () => {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold text-foreground mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: March 16, 2026</p>

      <div className="prose prose-sm max-w-none space-y-6 text-foreground/90 font-body">
        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mt-8 mb-3">1. Introduction</h2>
          <p>Glean ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our web application.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mt-8 mb-3">2. Information We Collect</h2>
          <p><strong>Account Information:</strong> When you create an account, we collect your email address and any profile information you choose to provide (such as a display name or avatar).</p>
          <p><strong>User Content:</strong> We store highlights, notes, and saved content that you submit to the platform.</p>
          <p><strong>Usage Data:</strong> We automatically collect basic usage information such as pages visited and features used to improve the service.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mt-8 mb-3">3. How We Use Your Information</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>To provide, maintain, and improve the Glean service</li>
            <li>To authenticate your account and manage your session</li>
            <li>To personalize your experience (e.g., saved highlights, search results)</li>
            <li>To communicate important service updates</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mt-8 mb-3">4. Data Sharing</h2>
          <p>We do not sell your personal information. We may share data only in the following circumstances:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>With service providers who help us operate the platform (e.g., hosting, authentication)</li>
            <li>When required by law or to protect our legal rights</li>
            <li>With your explicit consent</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mt-8 mb-3">5. Data Security</h2>
          <p>We use industry-standard security measures, including encryption in transit and at rest, to protect your data. However, no method of transmission over the internet is 100% secure.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mt-8 mb-3">6. Your Rights</h2>
          <p>You may request access to, correction of, or deletion of your personal data at any time by contacting us. You can also delete your account, which will remove your associated data.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mt-8 mb-3">7. Cookies</h2>
          <p>We use essential cookies for authentication and session management. We do not use third-party tracking cookies.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mt-8 mb-3">8. Children's Privacy</h2>
          <p>Glean is not intended for children under 13. We do not knowingly collect information from children under 13.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mt-8 mb-3">9. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated policy on this page with a revised date.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-foreground mt-8 mb-3">10. Contact Us</h2>
          <p>If you have questions about this Privacy Policy, please reach out to us through the application.</p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
